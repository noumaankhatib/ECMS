#!/usr/bin/env node
/**
 * One command to take a fresh machine, or a fresh environment, to working.
 *
 *   node scripts/setup.mjs              a local development machine
 *   node scripts/setup.mjs --dry-run    say what would change, change nothing
 *   node scripts/setup.mjs --env=production --production
 *
 * Deliberately dependency-free and written in plain JavaScript. It has to run
 * BEFORE `pnpm install` has ever been run, on a machine where node_modules does
 * not exist, so it may use nothing but Node's own builtins. That constraint is
 * the whole reason this file is not TypeScript like everything else.
 *
 * Three properties matter more than what it installs:
 *
 *   IT IS SAFE TO RUN TWICE. Every step checks the world before changing it.
 *   Running it on a machine that is already set up reports "already done" and
 *   touches nothing. A setup script people are afraid to re-run is a setup
 *   script that rots.
 *
 *   IT WILL NOT TOUCH PRODUCTION BY ACCIDENT. Naming a production target is not
 *   enough; --production must be passed as well. It also refuses to run a local
 *   setup against a database that is not on this machine, which is how the
 *   classic accident actually happens: the flags were right and .env was not.
 *
 *   IT CAN BE ASKED WHAT IT WOULD DO. --dry-run performs every check and no
 *   change, so the plan can be read before it is trusted.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where the checks below have to run from.
 *
 * `@prisma/client` is a dependency of apps/api, not of the workspace root, and
 * pnpm does not flatten packages into a shared node_modules. Anything importing
 * it must therefore be run from the API's own directory, or it will not resolve
 * — which on a fresh machine looks exactly like a broken database.
 */
const API = join(ROOT, 'apps/api');

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const HELP = `
Usage: node scripts/setup.mjs [options]

  --env=<target>     local (default), staging or production
  --production       Required before anything may touch a production target
  --dry-run          Report what would change; change nothing
  --skip-database    Do not manage the container; the database is someone else's
  --no-build         Skip the compile step
  --no-admin         Do not create a first administrator
  --admin-email=...  Address for the first administrator (local only)
  -h, --help         This message

Exit codes: 0 success, 1 a step failed, 2 refused on safety grounds.
`;

function parseOptions(argv) {
  const options = {
    target: null,
    production: false,
    dryRun: false,
    skipDatabase: false,
    build: true,
    admin: true,
    adminEmail: 'admin@ecms.local',
  };

  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg.startsWith('--env=')) options.target = arg.slice(6);
    else if (arg === '--production') options.production = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-database') options.skipDatabase = true;
    else if (arg === '--no-build') options.build = false;
    else if (arg === '--no-admin') options.admin = false;
    else if (arg.startsWith('--admin-email=')) options.adminEmail = arg.slice(14);
    else {
      process.stdout.write(`Unrecognised option: ${arg}\n${HELP}`);
      process.exit(2);
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

// Written as a code point rather than a literal escape byte, so this file
// stays free of control characters and survives copy, paste and diff intact.
const ESC = String.fromCharCode(27);
const colour = Boolean(process.stdout.isTTY) && !process.env['NO_COLOR'];
const paint = (code, text) => (colour ? `${ESC}[${code}m${text}${ESC}[0m` : text);
const bold = (t) => paint('1', t);
const green = (t) => paint('32', t);
const yellow = (t) => paint('33', t);
const red = (t) => paint('31', t);
const grey = (t) => paint('90', t);

let currentStep = '';
const startStep = (name) => {
  currentStep = name;
  process.stdout.write(`\n${bold(name)}\n`);
};
const done = (message) => process.stdout.write(`  ${green('OK')} ${message}\n`);
const already = (message) => process.stdout.write(`  ${green('OK')} ${grey(message)}\n`);
const would = (message) => process.stdout.write(`  ${yellow('->')} would ${message}\n`);
const note = (message) => process.stdout.write(`  ${grey('..')} ${grey(message)}\n`);
const fail = (message) => process.stdout.write(`  ${red('!!')} ${message}\n`);

class Refused extends Error {}
class StepFailed extends Error {}

/** Stops the run for a safety reason rather than a broken step. */
const refuse = (message) => {
  throw new Refused(message);
};

// ---------------------------------------------------------------------------
// Running things
// ---------------------------------------------------------------------------

/**
 * The single place a change is made.
 *
 * Everything that alters the machine goes through here, which is what makes
 * --dry-run trustworthy: there is no second path that could slip past it.
 */
function change(description, action) {
  if (OPTIONS.dryRun) {
    would(description);
    return null;
  }
  const result = action();
  done(description);
  return result;
}

function run(command, args, { cwd = ROOT, env = process.env, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });

  if (result.error) throw new StepFailed(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = quiet ? `\n${(result.stderr || result.stdout || '').trim()}` : '';
    throw new StepFailed(`${command} ${args.join(' ')} exited ${String(result.status)}${detail}`);
  }
  return (result.stdout ?? '').trim();
}

/** Runs something whose failure is information, not an error. */
function probe(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: 'pipe', encoding: 'utf8' });
  return {
    ok: !result.error && result.status === 0,
    out: (result.stdout ?? '').trim(),
    err: (result.stderr ?? '').trim(),
  };
}

const commandExists = (command) => probe(command, ['--version']).ok;

// ---------------------------------------------------------------------------
// The environment file
// ---------------------------------------------------------------------------

/** A deliberately small KEY=VALUE reader. dotenv is not available yet. */
function readEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at === -1) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/** Keys without which the application cannot start. */
const REQUIRED_KEYS = ['DATABASE_URL', 'MIGRATION_DATABASE_URL'];

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function preflight(context) {
  const [major] = process.versions.node.split('.').map(Number);
  const engines = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines ?? {};
  const required = Number((engines.node ?? '>=22').replace(/[^\d]/g, ''));

  if (major < required) {
    refuse(`Node ${String(required)} or newer is required; this is ${process.versions.node}.`);
  }
  already(`Node ${process.versions.node}`);

  if (!commandExists('pnpm')) {
    refuse('pnpm is not installed. Run `corepack enable` and try again.');
  }
  already(`pnpm ${probe('pnpm', ['--version']).out}`);

  if (context.managesDatabase) {
    if (!commandExists('docker')) {
      refuse('Docker is not installed, and it is what runs the local database.');
    }
    if (!probe('docker', ['info']).ok) {
      refuse('Docker is installed but not running. Start it and try again.');
    }
    already('Docker is running');
  }
}

/**
 * Creates .env from .env.example on a fresh machine, and otherwise says what is
 * missing from the one already there.
 *
 * It never edits an existing .env. A setup script that rewrites the file
 * holding your local credentials is one you stop running.
 */
function environmentFile(context) {
  const path = join(ROOT, '.env');
  const examplePath = join(ROOT, '.env.example');

  if (context.isProduction) {
    // Production configuration comes from the deployment environment, not from
    // a file this script writes. Inventing one here would be a way to ship a
    // development password to a live system.
    note('skipped - production reads its configuration from the environment');
    const missing = REQUIRED_KEYS.filter((key) => !process.env[key]);
    if (missing.length > 0) refuse(`Not set in the environment: ${missing.join(', ')}`);
    already('every required variable is present');
    return;
  }

  if (existsSync(path)) {
    already('.env exists - left exactly as it is');
  } else {
    if (!existsSync(examplePath)) refuse('.env.example is missing; cannot create .env.');
    change('create .env from .env.example', () => {
      writeFileSync(path, readFileSync(examplePath, 'utf8'), { mode: 0o600 });
    });
    if (OPTIONS.dryRun) return;
  }

  const values = readEnvFile(path);
  context.env = { ...process.env, ...values };

  const missing = REQUIRED_KEYS.filter((key) => !values[key]);
  if (missing.length > 0) refuse(`.env is missing: ${missing.join(', ')}`);
  already(`required variables present: ${REQUIRED_KEYS.join(', ')}`);

  // The accident this catches is not someone typing --production by mistake.
  // It is a local setup run against a remote database because .env was still
  // pointed at one. The flags were right; the file was not.
  for (const key of REQUIRED_KEYS) {
    const host = hostOf(values[key]);
    if (host && !LOCAL_HOSTS.has(host)) {
      refuse(
        `${key} points at ${host}, which is not this machine. ` +
          'Refusing to run a local setup against a remote database. ' +
          'Use --env=staging or --env=production if that is really what you want.',
      );
    }
  }
  already('the database is on this machine');
}

function dependencies(context) {
  // A frozen lockfile is right everywhere the lockfile is the source of truth.
  // Locally it is relaxed, because a developer who has just added a dependency
  // should not be told to go and run a different command.
  const args = context.target === 'local' ? ['install'] : ['install', '--frozen-lockfile'];
  change(`install dependencies (pnpm ${args.join(' ')})`, () =>
    run('pnpm', args, { env: context.env, quiet: true }),
  );
}

function prismaClient(context) {
  change('generate the Prisma client', () =>
    run('pnpm', ['run', 'db:generate'], { env: context.env, quiet: true }),
  );
}

function databaseContainer(context) {
  if (!context.managesDatabase) {
    note(
      context.isProduction
        ? 'skipped - production does not run its database in a local container'
        : 'skipped - --skip-database',
    );
    return;
  }

  const running = probe('docker', ['inspect', '--format', '{{.State.Running}}', 'ecms-postgres']);

  if (running.ok && running.out === 'true') {
    already('the database container is already running');
  } else {
    // `up -d --build` is idempotent, and --build is not optional: without it
    // Docker will happily reuse a cached image holding an old init script, so a
    // "clean" machine silently differs from the repository.
    change('start the database container', () =>
      run('pnpm', ['run', 'db:up'], { env: context.env, quiet: true }),
    );
  }

  if (OPTIONS.dryRun) {
    would('wait for the database to report healthy');
    return;
  }

  waitForHealthy();
}

function waitForHealthy() {
  const deadline = Date.now() + 90_000;
  for (;;) {
    const health = probe('docker', [
      'inspect',
      '--format',
      '{{.State.Health.Status}}',
      'ecms-postgres',
    ]);
    if (health.ok && health.out === 'healthy') {
      done('the database is healthy');
      return;
    }
    if (Date.now() > deadline) {
      throw new StepFailed(
        `The database did not become healthy within 90 seconds (last status: ${health.out || 'unknown'}).`,
      );
    }
    // Deliberately blocking. There is nothing else for this script to do, and a
    // busy wait here is simpler than the alternative for a one-shot tool.
    spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 2000)']);
  }
}

/**
 * Applies migrations with `migrate deploy`, never `migrate dev`.
 *
 * `deploy` only applies what is already in the repository. `dev` will offer to
 * generate new migrations and, when it thinks the history has diverged, to
 * reset the database - which is a data-loss prompt, and prompts get answered
 * with "yes" by people in a hurry. There is no path through this script that
 * can reach it.
 */
/**
 * Asks Prisma whether anything is outstanding.
 *
 * The wording is matched loosely and in one place. `migrate status` says
 * "Database schema is up to date!" today; earlier versions said "No pending
 * migrations". Both are accepted, and both callers ask the same question
 * through this function so they cannot drift into disagreeing about the answer.
 */
function schemaIsCurrent(context) {
  const status = probe('pnpm', ['run', 'db:status'], context.env);
  return status.ok && /(up to date|No pending migrations)/i.test(status.out);
}

function migrations(context) {
  if (schemaIsCurrent(context)) {
    already('every migration is already applied');
    return;
  }

  change('apply migrations (prisma migrate deploy)', () =>
    run('pnpm', ['run', 'db:deploy'], { env: context.env, quiet: true }),
  );
}

function build(context) {
  if (!OPTIONS.build) {
    note('skipped - --no-build');
    return;
  }
  change('compile the workspace', () =>
    run('pnpm', ['--filter', '@ecms/api', 'run', 'build'], { env: context.env, quiet: true }),
  );
}

/**
 * Creates a first administrator, but only on a local machine that has no users
 * at all.
 *
 * Anywhere else this only reports. Generating a credential for a real
 * environment and printing it to a terminal - which is to say, into somebody's
 * scrollback and quite possibly their CI log - is not a thing this script
 * should do on your behalf.
 */
function firstAdministrator(context) {
  if (!OPTIONS.admin) {
    note('skipped - --no-admin');
    return;
  }
  if (OPTIONS.dryRun) {
    // Said accurately per target. Outside local this step only ever reports,
    // and a dry run that overstates what it would do is worse than none.
    would(
      context.target === 'local'
        ? 'create a first administrator if no users exist'
        : 'report whether an administrator exists (one is never created outside local)',
    );
    return;
  }

  const count = countUsers(context);
  if (count === null) {
    note(`could not count users; skipping (${context.lastError ?? 'unknown reason'})`);
    return;
  }
  if (count > 0) {
    already(count === 1 ? '1 user already exists' : `${String(count)} users already exist`);
    return;
  }

  if (context.target !== 'local') {
    note('no users exist. Create the first one with: pnpm user:create <email> <name> <password>');
    return;
  }

  const password = randomBytes(18).toString('base64url');
  run(
    'node',
    [
      join(ROOT, 'apps/api/dist/tools/create-user.js'),
      OPTIONS.adminEmail,
      'Local Administrator',
      password,
      'SYSTEM_ADMINISTRATOR',
    ],
    { env: context.env, quiet: true },
  );

  done(`created ${OPTIONS.adminEmail}`);
  process.stdout.write(
    `\n  ${bold('Password (shown once):')} ${password}\n` +
      `  ${grey('Local development only. Change it, or delete the account, before this machine is shared.')}\n`,
  );
}

function countUsers(context) {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { PrismaClient } from '@prisma/client';
       const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
       console.log(await prisma.user.count());
       await prisma.$disconnect();`,
    ],
    { cwd: API, env: context.env, stdio: 'pipe', encoding: 'utf8' },
  );
  if (result.status !== 0) {
    // Reported rather than swallowed. A silent "skipping" here once hid the
    // fact that the database was unreachable for an entirely different reason.
    context.lastError = (result.stderr ?? '').trim().split('\n')[0];
    return null;
  }
  const parsed = Number((result.stdout ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Proves the environment is actually working, rather than merely set up.
 *
 * The interesting assertion is the second one. Steps 1 and 2 made audit history
 * immutable by giving the application's database account only INSERT and SELECT
 * on that table - a privilege, not application logic. This checks the guarantee
 * survived the setup, because a privilege that quietly went missing looks
 * exactly like one that is working, right up until it matters.
 *
 * The UPDATE it attempts carries `WHERE false`, so even in the failure case it
 * is incapable of altering a row. Postgres checks privileges before it looks at
 * rows, so the refusal still happens.
 */
function verify(context) {
  if (OPTIONS.dryRun) {
    would('check the schema is current and audit history is still locked');
    return;
  }

  if (!schemaIsCurrent(context)) {
    throw new StepFailed('The database schema is not up to date after migrating.');
  }
  done('the schema is current');

  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { PrismaClient } from '@prisma/client';
       const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
       await prisma.$queryRawUnsafe('SELECT 1 FROM audit_entry LIMIT 1');
       let locked = false;
       try {
         await prisma.$executeRawUnsafe('UPDATE audit_entry SET outcome = outcome WHERE false');
       } catch (error) {
         locked = /permission denied/i.test(String(error));
       }
       await prisma.$disconnect();
       console.log(locked ? 'LOCKED' : 'WRITABLE');`,
    ],
    { cwd: API, env: context.env, stdio: 'pipe', encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new StepFailed(`Could not reach the database as the application:\n${result.stderr}`);
  }
  if ((result.stdout ?? '').trim() !== 'LOCKED') {
    throw new StepFailed(
      'The application account can UPDATE audit history. That is the one thing it must never be able to do (PRD section 10).',
    );
  }
  done('audit history is append-only, and the application account is refused an UPDATE');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const OPTIONS = parseOptions(process.argv.slice(2));

function resolveTarget() {
  if (OPTIONS.target) return OPTIONS.target;
  const nodeEnv = process.env['NODE_ENV'];
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'staging') return 'staging';
  return 'local';
}

function main() {
  const target = resolveTarget();
  const isProduction = target === 'production';

  process.stdout.write(
    `${bold('ECMS environment setup')}  ${grey(
      `target: ${target}${OPTIONS.dryRun ? ', dry run' : ''}`,
    )}\n`,
  );

  // Naming production is not the same as meaning it. NODE_ENV can be set by a
  // shell profile, a CI runner or a stray export; --production cannot be
  // arrived at by accident.
  if (isProduction && !OPTIONS.production) {
    process.stdout.write(
      `\n${red('Refused.')} The target is production, but --production was not given.\n` +
        'Re-run with --dry-run first if you want to see what it would do.\n',
    );
    process.exit(2);
  }
  if (!isProduction && OPTIONS.production) {
    process.stdout.write(
      `\n${red('Refused.')} --production was given but the target is ${target}.\n`,
    );
    process.exit(2);
  }

  const context = {
    target,
    isProduction,
    managesDatabase: !OPTIONS.skipDatabase && !isProduction,
    env: process.env,
  };

  const steps = [
    ['Preflight', preflight],
    ['Environment file', environmentFile],
    ['Dependencies', dependencies],
    ['Prisma client', prismaClient],
    ['Database', databaseContainer],
    ['Migrations', migrations],
    ['Build', build],
    ['First administrator', firstAdministrator],
    ['Verify', verify],
  ];

  for (const [name, step] of steps) {
    startStep(name);
    try {
      step(context);
    } catch (error) {
      if (error instanceof Refused) {
        fail(error.message);
        process.stdout.write(`\n${red('Refused')} during: ${currentStep}\n`);
        process.exit(2);
      }
      fail(error instanceof Error ? error.message : String(error));
      process.stdout.write(`\n${red('Failed')} during: ${currentStep}\n`);
      process.exit(1);
    }
  }

  process.stdout.write(
    OPTIONS.dryRun
      ? `\n${bold('Dry run complete.')} Nothing was changed.\n`
      : `\n${green(bold('Ready.'))} Start the API with ${bold('pnpm dev')}.\n`,
  );
}

main();
