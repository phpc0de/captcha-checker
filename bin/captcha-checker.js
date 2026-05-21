#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const child = spawn(
  process.execPath,
  [
    resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs'),
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    cwd: process.cwd(),
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
