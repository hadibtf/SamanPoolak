# Attendance exporter (PowerShell + ACE OLEDB). Reads the FaraTechno/ZKTeco
# "WorkingTime" Access DB and writes an attendance.json IDENTICAL in shape to
# scripts/export-attendance.mjs:
#   { exportedAt, startDate, employees:[{cardNo,name}],
#     records:[{cardNo,dateKey,time,status,insertType}] }
#
# Called by export-attendance.bat (interactive), but usable directly:
#   powershell -ExecutionPolicy Bypass -File export-attendance.ps1 `
#     -Year 1405 -Month 4 -OutPath "$env:USERPROFILE\Desktop\1405-04.json"
# Month 0 (default) = the whole year.

param(
  [Parameter(Mandatory = $true)][string]$Year,
  [int]$Month = 0,
  [Parameter(Mandatory = $true)][string]$OutPath,
  [string]$DbPath = 'C:\Program Files (x86)\FaraTechno\WorkingTime\FaraTechnoDatabase.mdb',
  [string]$DbPass = '~Fara?59^'
)

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
  $emp = [ordered]@{}
  $emp.cardNo = "" + $e.mCardNo
  $emp.name = ($first + " " + $last).Trim()
  [void]$employees.Add($emp)
}

$mmStr = $Month.ToString("00")
$records = New-Object System.Collections.ArrayList
$sql = "SELECT mCardNo, mDate, mTrafficDateTime, mStatus, mInsertType FROM LtblTraffics ORDER BY mTrafficDateTime"
foreach ($r in (Read-Rows $sql)) {
  $dt = ("" + $r.mTrafficDateTime).Trim()
  $parts = $dt -split '\s+'
  $datePart = $parts[0]
  $timePart = ""
  if ($parts.Count -gt 1) { $timePart = $parts[1] }
  $dateKey = $datePart -replace '[/\-]', ''
  if ($dateKey.Length -ne 8) { continue }
  if ($dateKey.Substring(0, 4) -ne $Year) { continue }
  if ($Month -ne 0 -and $dateKey.Substring(4, 2) -ne $mmStr) { continue }
  $rec = [ordered]@{}
  $rec.cardNo = "" + $r.mCardNo
  $rec.dateKey = $dateKey
  $rec.time = $timePart
  $rec.status = [int]("" + $r.mStatus)
  $rec.insertType = [int]("" + $r.mInsertType)
  [void]$records.Add($rec)
}
$conn.Close()

if ($Month -eq 0) { $startKey = $Year + "0101" } else { $startKey = $Year + $mmStr + "01" }
$payload = [ordered]@{}
$payload.exportedAt = (Get-Date).ToString("o")
$payload.startDate = $startKey
$payload.employees = @($employees)
$payload.records = @($records)
$json = $payload | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($OutPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("OK " + $records.Count + " records / " + $employees.Count + " employees")
