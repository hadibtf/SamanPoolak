import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const action = process.argv[2];
const composeArgs = {
  up: ['compose', 'up', '-d', '--build'],
  down: ['compose', 'down'],
  status: ['compose', 'ps', '-a'],
  reset: ['compose', 'down', '-v'],
}[action];

if (!composeArgs) {
  console.error('Usage: node scripts/local-compose.mjs {up|down|status|reset}');
  process.exit(1);
}

const dockerBinCandidates = process.platform === 'win32'
  ? [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'resources', 'bin'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin'),
    ]
  : [];
const dockerBin = dockerBinCandidates.find((directory) =>
  fs.existsSync(path.join(directory, process.platform === 'win32' ? 'docker.exe' : 'docker'))
);
const docker = dockerBin
  ? path.join(dockerBin, process.platform === 'win32' ? 'docker.exe' : 'docker')
  : 'docker';
const env = { ...process.env };
if (dockerBin) {
  const updatedPath = `${dockerBin}${path.delimiter}${env.PATH || env.Path || ''}`;
  env.PATH = updatedPath;
  if (process.platform === 'win32') env.Path = updatedPath;
}

const child = spawn(docker, composeArgs, { stdio: 'inherit', env });
child.on('error', (error) => {
  console.error(`Could not run Docker Compose: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
