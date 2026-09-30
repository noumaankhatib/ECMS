// Point DATABASE_URL and MIGRATION_DATABASE_URL at the TEST database, composed
// from the individual DB_* variables. This runs before every test file, so the
// integration tests that read process.env['DATABASE_URL'] directly get the
// test database without each having to know about it. See tests/test-db.ts.

import { testDatabase } from './test-db';

const db = testDatabase();

process.env['DATABASE_URL'] = db.appUrl;
process.env['MIGRATION_DATABASE_URL'] = db.ownerUrl;
