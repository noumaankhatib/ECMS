#!/usr/bin/env node
/**
 * Runs the browser tests against real servers.
 *
 * Starts the API and the web application, waits for both, runs Playwright, and
 * shuts them down again whatever the outcome. The alternative — telling people
 * to start two servers in two terminals first — is a test suite that only the
 * person who wrote it ever runs.
 */

import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function start(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'ignore', detached: false });
  child.on('error', (error) => {
    process.stdout.write(`Could not start ${name}: ${error.message}\n`);
  });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

async function waitFor(url, seconds) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return true;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(130);
});

// Both applications are built first. Testing a stale build is worse than not
// testing, because it passes.
process.stdout.write('Building…\n');
for (const filter of ['@ecms/api', '@ecms/web']) {
  const build = spawnSync('pnpm', ['--filter', filter, 'run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

process.stdout.write('Starting the API and the web application…\n');
start('api', 'node', [join(ROOT, 'apps/api/dist/main.js')], ROOT);
start(
  'web',
  'node',
  ['node_modules/next/dist/bin/next', 'start', '--port', '3000'],
  join(ROOT, 'apps/web'),
);

const ready =
  (await waitFor('http://localhost:3001/health/live', 60)) &&
  (await waitFor('http://localhost:3000/login', 60));

if (!ready) {
  process.stdout.write('The servers did not come up.\n');
  stopAll();
  process.exit(1);
}

const test = spawnSync('pnpm', ['--filter', '@ecms/web', 'exec', 'playwright', 'test'], {
  cwd: ROOT,
  stdio: 'inherit',
});

stopAll();
process.exit(test.status ?? 1);
