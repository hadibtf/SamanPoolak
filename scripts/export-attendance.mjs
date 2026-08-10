// Local attendance exporter (dev/Windows only — NOT part of the deployed app).
//
// Reads the FaraTechno/ZKTeco "WorkingTime" Access database via the installed
// Microsoft.ACE.OLEDB driver (through PowerShell, since that's what reliably
// reads a password-protected .mdb on this machine) and writes attendance.json:
//
//   { exportedAt, startDate, employees:[{cardNo,name}], records:[{cardNo,dateKey,time,status,insertType}] }
//
// The web app imports that JSON via the «بروز رسانی سوابق» button. Dates in the
// device are already Jalali strings ("1405/01/06 07:18"), so dateKey is just the
// date with slashes removed (YYYYMMDD) and time is HH:mm.
//
// Usage:
//   npm run export:attendance
//   npm run export:attendance -- --start=1404/01/01 --out=./attendance.json
//   node scripts/export-attendance.mjs --path="C:\\...\\FaraTechnoDatabase.mdb" --password="~Fara?59^"
//
// Direct API push (skips the manual file import in the app). Provide --apiUrl
// plus either a --token or --user/--pass to log in:
//   node scripts/export-attendance.mjs --apiUrl=https://api.samanpoolak.ir \
//     --user=admin --pass=secret
//   node scripts/export-attendance.mjs --apiUrl=https://api.samanpoolak.ir --token=<bearer>
// The JSON file is still written either way (it's the fallback import path).

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULTS = {
  path: 'C:\\Program Files (x86)\\FaraTechno\\WorkingTime\\FaraTechnoDatabase.mdb',
  password: '~Fara?59^',
  start: '1405/01/01',
  out: join(process.cwd(), 'attendance.json'),
  apiUrl: '',
  token: '',
  user: '',
  pass: '',
};

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m && opts[m[1]] !== undefined) opts[m[1]] = m[2];
  }
  return opts;
}

// PowerShell script: connect with ACE, pull employees + traffics, write JSON (UTF-8, no BOM).
const PS_SCRIPT = String.raw`
param([string]$DbPath, [string]$DbPass, [string]$Start, [string]$OutPath)
$ErrorActionPreference = 'Stop'
$conn = New-Object -ComObject ADODB.Connection
$conn.Open("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$DbPath;Jet OLEDB:Database Password=$DbPass;")

function Read-Rows($sql) {
  $rs = New-Object -ComObject ADODB.Recordset
  $rs.Open($sql, $conn, 0, 1)
  $list = New-Object System.Collections.ArrayList
  while (-not $rs.EOF) {
    $o = @{}
    foreach ($f in $rs.Fields) { $o[$f.Name] = $f.Value }
    [void]$list.Add($o)
    $rs.MoveNext()
  }
  $rs.Close()
  return $list
}

$employees = New-Object System.Collections.ArrayList
foreach ($e in (Read-Rows "SELECT mCardNo, mName, mFamily FROM LtblEmployees")) {
  $first = ("" + $e.mName).Trim()
  $last = ("" + $e.mFamily).Trim()
  $name = ($first + " " + $last).Trim()
  $emp = [ordered]@{}
  $emp.cardNo = "" + $e.mCardNo
  $emp.name = $name
  [void]$employees.Add($emp)
}

$records = New-Object System.Collections.ArrayList
$sql = "SELECT mCardNo, mDate, mTrafficDateTime, mStatus, mInsertType FROM LtblTraffics WHERE mDate >= '$Start' ORDER BY mTrafficDateTime"
foreach ($r in (Read-Rows $sql)) {
  $dt = ("" + $r.mTrafficDateTime).Trim()
  $parts = $dt -split '\s+'
  $datePart = $parts[0]
  $timePart = ""
  if ($parts.Count -gt 1) { $timePart = $parts[1] }
  $dateKey = $datePart -replace '[/\-]', ''
  $rec = [ordered]@{}
  $rec.cardNo = "" + $r.mCardNo
  $rec.dateKey = $dateKey
  $rec.time = $timePart
  $rec.status = [int]("" + $r.mStatus)
  $rec.insertType = [int]("" + $r.mInsertType)
  [void]$records.Add($rec)
}
$conn.Close()

$startKey = $Start -replace '[/\-]', ''
$payload = [ordered]@{}
$payload.exportedAt = (Get-Date).ToString("o")
$payload.startDate = $startKey
$payload.employees = @($employees)
$payload.records = @($records)
$json = $payload | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($OutPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("OK " + $records.Count + " records / " + $employees.Count + " employees")
`;

// Push the exported file to the API's bulk-import endpoint (optional).
async function pushToApi(opts) {
  const base = opts.apiUrl.replace(/\/$/, '');
  let token = opts.token;
  if (!token) {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: opts.user, password: opts.pass }),
    });
    if (!res.ok) throw new Error(`Login failed (${res.status})`);
    token = (await res.json())?.token;
    if (!token) throw new Error('Login returned no token');
  }

  const payload = JSON.parse(readFileSync(opts.out, 'utf8'));
  const res = await fetch(`${base}/attendance/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ records: payload.records || [], employees: payload.employees || [] }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Import failed (${res.status}): ${data?.error || ''}`);
  console.log(`==> Pushed to API: ${data?.count ?? '?'} records imported.`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const psFile = join(tmpdir(), `export-attendance-${process.pid}.ps1`);
  writeFileSync(psFile, PS_SCRIPT, 'utf8');

  console.log(`==> Reading ${opts.path}`);
  console.log(`    from ${opts.start} -> ${opts.out}`);
  const r = spawnSync(
    'powershell.exe',
    [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', psFile,
      '-DbPath', opts.path,
      '-DbPass', opts.password,
      '-Start', opts.start,
      '-OutPath', opts.out,
    ],
    { encoding: 'utf8' }
  );
  try { unlinkSync(psFile); } catch { /* ignore */ }

  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0) {
    console.error('\nExport failed:');
    if (r.stderr) process.stderr.write(r.stderr);
    process.exit(1);
  }
  console.log(`Done. File written: ${opts.out}`);

  if (opts.apiUrl && (opts.token || (opts.user && opts.pass))) {
    try {
      await pushToApi(opts);
    } catch (err) {
      console.error(`\nAPI push failed: ${err.message}`);
      console.error('The file was still written — import it from the attendance tab as a fallback.');
      process.exit(1);
    }
  } else {
    console.log('Import it from the attendance tab («بروز رسانی سوابق»), or pass --apiUrl + --user/--pass to push directly.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
