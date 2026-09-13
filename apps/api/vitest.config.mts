import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Integration tests run against the real database. There is no mocked Prisma
// here on purpose: the behaviour under test is a database privilege and a
// transaction boundary, neither of which a mock can prove.
config({ path: '../../.env' });

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts', 'src/**/*.test.ts'],
    passWithNoTests: false,
    testTimeout: 30_000,
    pool: 'forks',
    // Required-documents (Phase 9) is a genuinely global, mutable catalogue,
    // and Phase 10's closure gate is the first thing that treats it as a
    // hard precondition rather than an informational read — two test files
    // racing to add/retire a requirement while another checks a project's
    // completeness would flip a real result, not just collide on fixture
    // data. Running files sequentially against the one shared database
    // removes that class of flakiness the same way the transaction-per-test
    // discipline already does within a file.
    fileParallelism: false,
  },
});
