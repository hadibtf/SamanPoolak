// Local deploy over FTPS — cross-platform (Node + curl), no bash/WSL needed.
//
// Usage:
//   npm run deploy:web      build the front-end and upload it to platform
//   npm run deploy:platform build the front-end and upload it to platform
//   npm run deploy:api      upload the PHP backend to the API document root
//   npm run deploy:landing  upload the marketing site to samanpoolak.ir
//   npm run deploy:jobs     upload the careers site to jobs.samanpoolak.ir
//   npm run deploy:all      deploy API + platform + landing + jobs
//
// Credentials and optional tuning values are read from ./deploy.env.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, 'deploy.env');

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    console.error(
      `ERROR: ${file} not found. Copy deploy.env.sample to deploy.env and fill it in.`,
    );
    process.exit(1);
  }

  const cfg = {};

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    // Allow optional matching quotes in deploy.env.
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    cfg[key] = value;
  }

  return cfg;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleep(ms) {
  if (ms <= 0) return;

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const env = loadEnv(ENV_FILE);

const FTP_SERVER = env.FTP_SERVER;
const FTP_WEB_DIR = env.FTP_WEB_DIR || 'public_html';
const FTP_API_DIR = env.FTP_API_DIR || 'public_html/api';
const FTP_LANDING_DIR = env.FTP_LANDING_DIR || 'samanpoolak.ir';
const FTP_JOBS_DIR = env.FTP_JOBS_DIR || 'jobs';
const FTP_EMPLOYEE_DIR = env.FTP_EMPLOYEE_DIR || 'employee';
const API_URL = env.API_URL || 'https://samanpoolak.ir/api';
const MANUAL_PACKAGE_DIR =
  env.MANUAL_PACKAGE_DIR || path.join(ROOT, 'deploy-manual');

// FTPS reliability tuning. These can be overridden in deploy.env.
const FTP_UPLOAD_ATTEMPTS = positiveInteger(env.FTP_UPLOAD_ATTEMPTS, 6);
const FTP_RETRY_BASE_MS = positiveInteger(env.FTP_RETRY_BASE_MS, 2000);
const FTP_BETWEEN_FILES_MS = nonNegativeInteger(
  env.FTP_BETWEEN_FILES_MS,
  750,
);
const FTP_CONNECT_TIMEOUT = positiveInteger(env.FTP_CONNECT_TIMEOUT, 20);
const FTP_MAX_TIME = positiveInteger(env.FTP_MAX_TIME, 180);

const WINSCP_CANDIDATES = [
  env.WINSCP_PATH,
  process.env.LOCALAPPDATA &&
    path.join(process.env.LOCALAPPDATA, 'Programs', 'WinSCP', 'WinSCP.com'),
  process.env['ProgramFiles(x86)'] &&
    path.join(process.env['ProgramFiles(x86)'], 'WinSCP', 'WinSCP.com'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'WinSCP', 'WinSCP.com'),
].filter(Boolean);

let NETRC = null;

function requireFtpConfig() {
  for (const key of ['FTP_SERVER', 'FTP_USER', 'FTP_PASSWORD']) {
    if (!env[key]) {
      console.error(`ERROR: set ${key} in deploy.env`);
      process.exit(1);
    }
  }

  if (NETRC) return;

  // Build a temporary netrc file so the FTP password does not appear in the
  // curl command line or process list.
  NETRC = path.join(os.tmpdir(), `ftp_deploy_${process.pid}.netrc`);

  fs.writeFileSync(
    NETRC,
    `machine ${FTP_SERVER} login ${env.FTP_USER} password ${env.FTP_PASSWORD}\n`,
    { mode: 0o600 },
  );
}

function cleanup() {
  if (!NETRC) return;

  try {
    fs.unlinkSync(NETRC);
  } catch {
    // Ignore cleanup errors.
  }
}

process.on('exit', cleanup);

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

// Glob match against the file path relative to its source directory.
// "*" matches across folders, so "*.md" excludes nested Markdown files too.
// Patterns without "*" match the exact relative path only.
function excluded(rel, patterns) {
  return patterns.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*') +
          '$',
      );

      return regex.test(rel);
    }

    return rel === pattern;
  });
}

function listFiles(dir) {
  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function findWinScp() {
  return WINSCP_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

function winScpUrlPart(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function winScpQuote(value) {
  return String(value).replace(/"/g, '""');
}

function ensureEmptyDir(dir) {
  fs.rmSync(dir, {
    recursive: true,
    force: true,
  });
  fs.mkdirSync(dir, {
    recursive: true,
  });
}

function copyTree(src, dest, excludes = []) {
  if (!fs.existsSync(src)) {
    console.error(`ERROR: ${src} does not exist (build first?)`);
    process.exit(1);
  }

  for (const file of listFiles(src)) {
    const rel = path.relative(src, file).split(path.sep).join('/');

    if (excluded(rel, excludes)) continue;

    const destFile = path.join(dest, ...rel.split('/'));
    fs.mkdirSync(path.dirname(destFile), {
      recursive: true,
    });
    fs.copyFileSync(file, destFile);
  }
}

function encodeRemotePath(value) {
  return value
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function curlErrorText(result) {
  return (
    result.stderr ||
    result.stdout ||
    result.error?.message ||
    `curl exited with status ${String(result.status)}`
  )
    .toString()
    .trim();
}

// These curl failures normally indicate a configuration/authentication issue,
// so repeatedly retrying them would only hammer the FTP server.
const NON_RETRYABLE_CURL_STATUSES = new Set([
  2, // command-line usage error
  3, // malformed URL
  5, // proxy could not be resolved
  6, // host could not be resolved
  9, // FTP access denied
  26, // local file could not be read
  37, // local file could not be opened
  43, // bad function argument
  48, // unknown option
  51, // certificate/fingerprint verification problem
  58, // local certificate problem
  60, // peer certificate verification problem
  67, // login denied
  77, // CA certificate file problem
]);

function uploadFile(file, rel, dest) {
  requireFtpConfig();

  const remoteBase = encodeRemotePath(dest);
  const remoteFile = encodeRemotePath(rel);
  const url = `ftp://${FTP_SERVER}/${remoteBase}/${remoteFile}`;

  let lastResult = null;

  for (let attempt = 1; attempt <= FTP_UPLOAD_ATTEMPTS; attempt++) {
    const args = [
      '-sS',

      // FTP/FTPS cannot be routed through the HTTP proxy configured by VPNs,
      // proxy clients, or Windows environment variables. Without this curl may
      // try the proxy (currently 127.0.0.1:9 on this machine) instead of the
      // cPanel host, making every automatic deploy fail before authentication.
      '--noproxy',
      '*',

      // Explicit FTPS. The connection starts as FTP and upgrades to TLS.
      '--ssl-reqd',

      // Keep the behavior of the original script. Remove this when the host's
      // FTPS certificate validates correctly on this computer.
      '--insecure',

      '--netrc-file',
      NETRC,

      '--ftp-create-dirs',

      // Shared-hosting FTP firewalls/NAT setups are often more reliable with
      // traditional PASV instead of EPSV.
      '--ftp-pasv',
      '--disable-epsv',

      // Reduce the number of CWD commands used for nested paths.
      '--ftp-method',
      'singlecwd',

      '--connect-timeout',
      String(FTP_CONNECT_TIMEOUT),

      '--max-time',
      String(FTP_MAX_TIME),

      '--keepalive-time',
      '15',

      '--upload-file',
      file,

      url,
    ];

    const result = spawnSync('curl', args, {
      encoding: 'utf8',
      windowsHide: true,
    });

    lastResult = result;

    if (result.status === 0) {
      return {
        ok: true,
        attempts: attempt,
      };
    }

    const error = curlErrorText(result);
    const status = result.status;

    const canRetry =
      attempt < FTP_UPLOAD_ATTEMPTS &&
      !NON_RETRYABLE_CURL_STATUSES.has(status);

    if (!canRetry) {
      return {
        ok: false,
        attempts: attempt,
        status,
        error,
      };
    }

    const delay = FTP_RETRY_BASE_MS * 2 ** (attempt - 1);

    process.stdout.write(
      `\n  RETRY ${attempt}/${FTP_UPLOAD_ATTEMPTS - 1}: ${rel} ` +
        `(curl ${String(status)}: ${error})\n` +
        `  waiting ${Math.round(delay / 1000)}s before retry...`,
    );

    sleep(delay);
  }

  return {
    ok: false,
    attempts: FTP_UPLOAD_ATTEMPTS,
    status: lastResult?.status,
    error: lastResult
      ? curlErrorText(lastResult)
      : 'Unknown curl failure',
  };
}

function uploadTree(src, dest, excludes = []) {
  if (!fs.existsSync(src)) {
    console.error(`ERROR: ${src} does not exist (build first?)`);
    process.exit(1);
  }

  requireFtpConfig();

  const winScp = findWinScp();

  if (!winScp) {
    console.error(
      'ERROR: WinSCP.com was not found. Install WinSCP or set WINSCP_PATH in deploy.env.',
    );
    return false;
  }

  // One WinSCP synchronize command keeps a single FTPS session open and
  // transfers only changed files. The previous curl approach made a separate
  // TLS login for every asset, which this shared host regularly timed out.
  const tempScript = path.join(os.tmpdir(), `samanpoolak_winscp_${process.pid}.txt`);
  const fileMask = excludes.length > 0 ? ` -filemask="|${excludes.join(';')}"` : '';
  const sessionUrl =
    `ftp://${winScpUrlPart(env.FTP_USER)}:${winScpUrlPart(env.FTP_PASSWORD)}` +
    `@${FTP_SERVER}/`;
  const commands = [
    'option batch abort',
    'option confirm off',
    // This matches curl's existing --insecure behavior. The host's AutoSSL
    // certificate can later be pinned with WinSCP's -certificate option.
    `open ${sessionUrl} -explicit -certificate=*`,
    `synchronize remote${fileMask} "${winScpQuote(src)}" "${winScpQuote(dest)}"`,
    'exit',
  ];

  try {
    fs.writeFileSync(tempScript, `${commands.join('\n')}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });

    const result = spawnSync(
      winScp,
      [`/script=${tempScript}`, '/ini=nul', '/nointeractiveinput'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
      },
    );

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.error) {
      console.error(`WinSCP failed to start: ${result.error.message}`);
      return false;
    }

    return result.status === 0;
  } finally {
    try {
      fs.unlinkSync(tempScript);
    } catch {
      // The temporary script only contains this one deploy's credentials.
    }
  }

  const files = listFiles(src)
    .map((file) => ({
      file,
      rel: path.relative(src, file).split(path.sep).join('/'),
    }))
    .filter(({ rel }) => !excluded(rel, excludes));

  let uploaded = 0;
  const failures = [];

  for (let index = 0; index < files.length; index++) {
    const { file, rel } = files[index];
    const result = uploadFile(file, rel, dest);

    if (result.ok) {
      uploaded++;

      // "." means uploaded on the first attempt.
      // "+" means uploaded successfully after at least one retry.
      process.stdout.write(result.attempts === 1 ? '.' : '+');
    } else {
      failures.push({
        rel,
        ...result,
      });

      process.stdout.write(
        `\n  FAILED: ${rel} after ${result.attempts} attempt(s) ` +
          `(curl ${String(result.status)}: ${result.error})\n`,
      );
    }

    // Every file currently starts a fresh curl/FTPS session. A small pause
    // prevents rapid TLS handshakes and logins from overwhelming or
    // rate-limiting a shared-hosting FTP service.
    if (index < files.length - 1) {
      sleep(FTP_BETWEEN_FILES_MS);
    }
  }

  process.stdout.write(
    `\n  uploaded ${uploaded}, failed ${failures.length}, total ${files.length}\n`,
  );

  if (failures.length > 0) {
    console.error('\nFiles that still failed:');

    for (const failure of failures) {
      console.error(`  - ${failure.rel}`);
    }
  }

  return failures.length === 0;
}

function build(surface = 'management') {
  console.log(`==> Building ${surface} front-end (REACT_APP_API_URL=${API_URL})`);

  // shell:true is required so Windows can execute npm.cmd.
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      REACT_APP_API_URL: API_URL,
      REACT_APP_APP_SURFACE: surface,
      CI: 'true',
    },
  });

  if (result.error) {
    console.error(result.error.message);
  }

  if (result.status !== 0) {
    console.error('Build failed.');
    process.exit(1);
  }
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;

  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const day =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return {
    time,
    day,
  };
}

function createZip(src, zipFile) {
  const files = listFiles(src).map((file) => ({
    file,
    rel: path.relative(src, file).split(path.sep).join('/'),
  }));
  const chunks = [];
  const central = [];
  let offset = 0;

  fs.rmSync(zipFile, {
    force: true,
  });
  fs.mkdirSync(path.dirname(zipFile), {
    recursive: true,
  });

  for (const { file, rel } of files) {
    const data = fs.readFileSync(file);
    const compressed = zlib.deflateRawSync(data);
    const name = Buffer.from(rel, 'utf8');
    const stat = fs.statSync(file);
    const { time, day } = dosDateTime(stat.mtime);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(day, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);

    central.push(entry, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(zipFile, Buffer.concat([...chunks, ...central, end]));
}

function packageTarget({ name, label, source, dest, excludes, needsBuild, surface }, outDir) {
  if (needsBuild) {
    build(surface);
  }

  const stageDir = path.join(os.tmpdir(), `samanpoolak_${name}_${process.pid}`);
  const zipFile = path.join(outDir, `${name}.zip`);

  ensureEmptyDir(stageDir);
  copyTree(source, stageDir, excludes);
  createZip(stageDir, zipFile);
  fs.rmSync(stageDir, {
    recursive: true,
    force: true,
  });

  return {
    name,
    label,
    zipFile,
    dest,
  };
}

function deployWeb() {
  build('management');

  console.log(
    `==> Uploading build/ to ${FTP_WEB_DIR} ` +
      `(excluding .htaccess so the server's copy stays intact)`,
  );

  return uploadTree(path.join(ROOT, 'build'), FTP_WEB_DIR, [
    '.htaccess',
  ]);
}

function deployApi() {
  console.log(
    `==> Uploading server/ to ${FTP_API_DIR} (excluding docs + config)`,
  );

  return uploadTree(path.join(ROOT, 'server'), FTP_API_DIR, [
    '*.md',
    'config.php',
    'config.sample.php',
  ]);
}

function deployLanding() {
  console.log(
    `==> Uploading landing/ to ${FTP_LANDING_DIR} ` +
      `(static marketing site; excluding docs + .htaccess)`,
  );

  return uploadTree(path.join(ROOT, 'landing'), FTP_LANDING_DIR, [
    '*.md',
    '.htaccess',
  ]);
}

function deployEmployee() {
  build('employee');
  console.log(`==> Uploading employee build/ to ${FTP_EMPLOYEE_DIR}`);
  const uploaded = uploadTree(path.join(ROOT, 'build'), FTP_EMPLOYEE_DIR);
  if (!uploaded) return false;
  // WinSCP synchronize skips this hidden dotfile on the host. Upload it
  // explicitly so BrowserRouter deep links survive a hard refresh.
  const rewrite = uploadFile(path.join(ROOT, 'build', '.htaccess'), '.htaccess', FTP_EMPLOYEE_DIR);
  if (!rewrite.ok) console.error(`Employee SPA rewrite upload failed: ${rewrite.error}`);
  return rewrite.ok;
}

function deployJobs() {
  console.log(
    `==> Uploading jobs/ to ${FTP_JOBS_DIR} ` +
      `(static careers site; excluding docs + .htaccess)`,
  );

  return uploadTree(path.join(ROOT, 'jobs'), FTP_JOBS_DIR, [
    '*.md',
    '.htaccess',
  ]);
}

const DEPLOY_TARGETS = {
  api: {
    name: 'api',
    label: 'API',
    source: path.join(ROOT, 'server'),
    dest: FTP_API_DIR,
    excludes: ['*.md', 'config.php', 'config.sample.php'],
    needsBuild: false,
  },
  platform: {
    name: 'platform',
    label: 'Platform app',
    source: path.join(ROOT, 'build'),
    dest: FTP_WEB_DIR,
    excludes: ['.htaccess'],
    needsBuild: true,
  },
  landing: {
    name: 'landing',
    label: 'Landing site',
    source: path.join(ROOT, 'landing'),
    dest: FTP_LANDING_DIR,
    excludes: ['*.md', '.htaccess'],
    needsBuild: false,
  },
  jobs: {
    name: 'jobs',
    label: 'Careers site',
    source: path.join(ROOT, 'jobs'),
    dest: FTP_JOBS_DIR,
    excludes: ['*.md', '.htaccess'],
    needsBuild: false,
  },
  employee: {
    name: 'employee',
    label: 'Employee app',
    source: path.join(ROOT, 'build'),
    dest: FTP_EMPLOYEE_DIR,
    excludes: [],
    needsBuild: true,
    surface: 'employee',
  },
};

function normalizeTarget(value) {
  return value === 'web' ? 'platform' : value;
}

function targetsFor(value) {
  const target = normalizeTarget(value);

  if (target === 'all') {
    return [
      DEPLOY_TARGETS.api,
      DEPLOY_TARGETS.platform,
      DEPLOY_TARGETS.landing,
      DEPLOY_TARGETS.jobs,
      DEPLOY_TARGETS.employee,
    ];
  }

  if (DEPLOY_TARGETS[target]) {
    return [DEPLOY_TARGETS[target]];
  }

  return null;
}

async function chooseMode(cliMode) {
  return cliMode || 'automatic';
}

function writeManualInstructions(outDir, packages) {
  const lines = [
    '# Manual Deploy Packages',
    '',
    `Created: ${new Date().toISOString()}`,
    '',
    'Upload each zip to the matching folder in cPanel File Manager, extract it there, then delete the zip from the server.',
    '',
    'Important:',
    '- Do not upload these zips to /public_html unless a destination below explicitly says /home/hadibt/public_html.',
    '- Platform, landing, and jobs zips do not include .htaccess; keep the existing server-owned .htaccess files in place there.',
    '- The API zip includes its required API .htaccess router.',
    '- Keep /home/hadibt/api/config.php in place.',
    '',
    'Packages:',
    '',
  ];

  for (const item of packages) {
    lines.push(`## ${item.label}`);
    lines.push(`Zip: ${item.zipFile}`);
    lines.push(`Upload to: /home/hadibt/${item.dest}`);
    lines.push('Unzip in that same folder.');
    lines.push('After unzip: delete the uploaded zip file from the server.');
    lines.push('');
  }

  lines.push('After finishing:');
  lines.push('- Hard-refresh the browser for platform/landing/jobs changes.');
  lines.push('- For API schema changes, run the required SQL manually in phpMyAdmin.');
  lines.push('- On platform, you may delete old hashed JS/CSS files that are no longer referenced by index.html.');
  lines.push('');

  const file = path.join(outDir, 'UPLOAD-INSTRUCTIONS.md');
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return file;
}

function manualDeploy(targets) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  const outDir = path.join(MANUAL_PACKAGE_DIR, stamp);

  fs.mkdirSync(outDir, {
    recursive: true,
  });

  console.log(`==> Creating manual deploy package(s) in ${outDir}`);

  const packages = targets.map((target) => packageTarget(target, outDir));
  const instructions = writeManualInstructions(outDir, packages);

  console.log('\nManual packages ready:');

  for (const item of packages) {
    console.log(`  - ${item.label}: ${item.zipFile}`);
    console.log(`    Upload/unzip in: /home/hadibt/${item.dest}`);
  }

  console.log(`\nInstructions: ${instructions}`);
  return true;
}

async function main() {
  const target = normalizeTarget(process.argv[2]);
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = await chooseMode(modeArg?.slice('--mode='.length).toLowerCase());
  const targets = targetsFor(target);
  let ok = true;

  if (!targets) {
    console.error(
      'Usage: node scripts/deploy.mjs {api|platform|web|landing|jobs|employee|all} [--mode=automatic|manual]',
    );
    process.exit(2);
  }

  if (mode === 'manual') {
    ok = manualDeploy(targets);
  } else if (mode === 'automatic') {
    if (target === 'api') {
      ok = deployApi();
    } else if (target === 'platform') {
      ok = deployWeb();
    } else if (target === 'landing') {
      ok = deployLanding();
    } else if (target === 'jobs') {
      ok = deployJobs();
    } else if (target === 'employee') {
      ok = deployEmployee();
    } else if (target === 'all') {
      const apiOk = deployApi();
      const webOk = deployWeb();
      const landingOk = deployLanding();
      const jobsOk = deployJobs();
      const employeeOk = deployEmployee();

      ok = apiOk && webOk && landingOk && jobsOk && employeeOk;
    }
  } else {
    console.error('ERROR: deploy mode must be "automatic" or "manual".');
    process.exit(2);
  }

  console.log(ok ? 'Done.' : 'Done with errors.');
  process.exit(ok ? 0 : 1);
}

await main();
