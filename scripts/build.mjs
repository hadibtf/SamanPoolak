import { spawnSync } from 'node:child_process';

const surface = process.argv[2];
const surfaces = {
  platform: 'management',
  employee: 'employee',
};

if (!Object.hasOwn(surfaces, surface)) {
  console.error('Usage: node scripts/build.mjs {platform|employee}');
  process.exit(2);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['vite', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    VITE_APP_SURFACE: surfaces[surface],
  },
});

if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
