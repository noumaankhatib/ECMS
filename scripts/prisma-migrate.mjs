/**
 * Wrapper that composes MIGRATION_DATABASE_URL from individual DB_* variables
 * before invoking the Prisma CLI. Run via package.json scripts with --env-file
 * so DB_* are already in process.env when this script runs.
 *
 * After a `reset` (or `dev` which may reset), re-applies the ecms_app grants
 * that are lost when Prisma drops and recreates the public schema.
 *
 * Usage (via package.json scripts):
 *   node --env-file=.env scripts/prisma-migrate.mjs dev
 *   node --env-file=.env scripts/prisma-migrate.mjs deploy
 *   node --env-file=.env scripts/prisma-migrate.mjs status
 *   node --env-file=.env scripts/prisma-migrate.mjs reset
 */
import { execFileSync } from 'node:child_process';

const host = process.env.DB_HOST ?? 'localhost';
const port = process.env.DB_PORT ?? '5432';
const dbName = process.env.DB_NAME ?? 'ecms';
const ownerUser = process.env.DB_OWNER_USER ?? 'ecms_owner';
const ownerPassword = encodeURIComponent(process.env.DB_OWNER_PASSWORD ?? '');
const appUser = process.env.DB_APP_USER ?? 'ecms_app';
const superUser = process.env.DB_SUPER_USER ?? 'postgres';
const superPassword = encodeURIComponent(process.env.DB_SUPER_PASSWORD ?? '');

process.env.MIGRATION_DATABASE_URL =
  `postgresql://${ownerUser}:${ownerPassword}@${host}:${port}/${dbName}`;

const [, , command = 'status', ...rest] = process.argv;

execFileSync(
  'pnpm',
  ['exec', 'prisma', 'migrate', command, '--schema=apps/api/prisma/schema.prisma', ...rest],
  { stdio: 'inherit', env: process.env },
);

// After reset (or dev, which may reset), re-apply ecms_app schema grants.
// prisma migrate reset drops and recreates the public schema, which strips the
// GRANT USAGE that init.sql applied. Those grants only run once on an empty
// volume, so we must re-apply them here.
if (command === 'reset' || command === 'dev') {
  const superUrl = `postgresql://${superUser}:${superPassword}@${host}:${port}/${dbName}`;
  const sql = [
    `GRANT CONNECT ON DATABASE ${dbName} TO ${appUser}`,
    `GRANT USAGE ON SCHEMA public TO ${appUser}`,
    `REVOKE CREATE ON SCHEMA public FROM ${appUser}, PUBLIC`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerUser} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appUser}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerUser} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${appUser}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appUser}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appUser}`,
  ].join('; ');

  execFileSync('psql', [superUrl, '-c', sql], { stdio: 'inherit' });
}
