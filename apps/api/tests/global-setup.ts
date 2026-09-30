import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { testDatabase } from './test-db';

/**
 * Runs once before the suite: makes sure the test database exists, carries the
 * same privilege split as docker/postgres/init.sql, and is fully migrated.
 *
 * Everything here runs as ecms_owner, not the superuser. The owner holds
 * CREATEDB locally and in CI (init.sql), owns the new database, and pg_trgm is
 * a trusted extension — so no superuser password is needed to run tests.
 */
export default async function setup(): Promise<void> {
  const db = testDatabase();

  const maintenance = new PrismaClient({ datasourceUrl: db.ownerMaintenanceUrl });
  try {
    const existing = await maintenance.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_database WHERE datname = ${db.name}`;
    if (existing.length === 0) {
      await maintenance.$executeRawUnsafe(`CREATE DATABASE "${db.name}"`);
    }
  } finally {
    await maintenance.$disconnect();
  }

  // Idempotent, and applied before migrating: the default privileges must be
  // in place before the migrations create tables, exactly as init.sql does
  // for the application database. The audit table's narrower grant is then
  // set by its own migration.
  const owner = new PrismaClient({ datasourceUrl: db.ownerUrl });
  try {
    for (const statement of [
      `GRANT CONNECT ON DATABASE "${db.name}" TO ${db.appUser}`,
      `GRANT USAGE ON SCHEMA public TO ${db.appUser}`,
      `REVOKE CREATE ON SCHEMA public FROM ${db.appUser}, PUBLIC`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${db.ownerUser} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${db.appUser}`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${db.ownerUser} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${db.appUser}`,
    ]) {
      await owner.$executeRawUnsafe(statement);
    }
  } finally {
    await owner.$disconnect();
  }

  const apiRoot = path.resolve(import.meta.dirname, '..');
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma'], {
      cwd: apiRoot,
      env: { ...process.env, MIGRATION_DATABASE_URL: db.ownerUrl },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = (error as { stdout?: Buffer; stderr?: Buffer }).stdout?.toString() ?? '';
    const errors = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(`Migrating the test database "${db.name}" failed:\n${output}${errors}`);
  }
}
