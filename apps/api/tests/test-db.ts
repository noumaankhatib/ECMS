/**
 * Where the integration tests run: a database of their own, never the one the
 * application uses.
 *
 * Tests create clients, projects and users on every run and never delete them
 * (audit history cannot be deleted, by design). Pointed at the development
 * database they filled its lists with "Test Client …" rows, and once those
 * lists passed a page of 100 the tests themselves began failing at random.
 */
export function testDatabase() {
  const appDb = process.env['DB_NAME'] ?? 'ecms';
  const name = process.env['DB_TEST_NAME'] ?? `${appDb}_test`;

  // The whole point of this file. A misconfigured .env must not quietly send
  // the suite back to real data.
  if (name === appDb) {
    throw new Error(`DB_TEST_NAME must differ from DB_NAME ("${appDb}"); refusing to run tests.`);
  }
  // Interpolated into CREATE DATABASE, which cannot take a bound parameter.
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`DB_TEST_NAME "${name}" may only contain a-z, 0-9 and _.`);
  }

  const host = process.env['DB_HOST'] ?? 'localhost';
  const port = process.env['DB_PORT'] ?? '5432';
  const appUser = process.env['DB_APP_USER'] ?? 'ecms_app';
  const appPassword = encodeURIComponent(process.env['DB_APP_PASSWORD'] ?? '');
  const ownerUser = process.env['DB_OWNER_USER'] ?? 'ecms_owner';
  const ownerPassword = encodeURIComponent(process.env['DB_OWNER_PASSWORD'] ?? '');
  const server = `${host}:${port}`;

  return {
    name,
    appDb,
    appUser,
    ownerUser,
    appUrl: `postgresql://${appUser}:${appPassword}@${server}/${name}`,
    ownerUrl: `postgresql://${ownerUser}:${ownerPassword}@${server}/${name}`,
    /** The owner connected to the application database — only to CREATE the test one. */
    ownerMaintenanceUrl: `postgresql://${ownerUser}:${ownerPassword}@${server}/${appDb}`,
  };
}
