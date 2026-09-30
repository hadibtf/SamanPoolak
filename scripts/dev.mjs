import { spawn } from 'node:child_process';

const surface = process.argv[2];
const settings = {
  platform: { port: '3000', appSurface: 'management' },
  employee: { port: '3001', appSurface: 'employee' },
}[surface];

if (!settings) {
  console.error('Usage: node scripts/dev.mjs {platform|employee}');
  process.exit(1);
}

const command = process.platform === 'win32'
  ? (process.env.ComSpec || 'cmd.exe')
  : 'npm';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm start']
  : ['start'];
const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: process.env.HOST || '127.0.0.1',
    PORT: process.env.PORT || settings.port,
    REACT_APP_APP_SURFACE: settings.appSurface,
    REACT_APP_API_URL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  },
});

child.on('error', (error) => {
  console.error(`Could not start the ${surface} app: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
