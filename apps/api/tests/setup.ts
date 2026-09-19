// Compose DATABASE_URL and MIGRATION_DATABASE_URL from individual DB_* variables.
// This runs before every test file, so the 18 integration tests that read
// process.env['DATABASE_URL'] directly continue to work unchanged.

const dbHost = process.env['DB_HOST'] ?? 'localhost';
const dbPort = process.env['DB_PORT'] ?? '5432';
const dbName = process.env['DB_NAME'] ?? 'ecms';
const appUser = process.env['DB_APP_USER'] ?? 'ecms_app';
const appPassword = encodeURIComponent(process.env['DB_APP_PASSWORD'] ?? '');
const ownerUser = process.env['DB_OWNER_USER'] ?? 'ecms_owner';
const ownerPassword = encodeURIComponent(process.env['DB_OWNER_PASSWORD'] ?? '');

process.env['DATABASE_URL'] = `postgresql://${appUser}:${appPassword}@${dbHost}:${dbPort}/${dbName}`;
process.env['MIGRATION_DATABASE_URL'] = `postgresql://${ownerUser}:${ownerPassword}@${dbHost}:${dbPort}/${dbName}`;
