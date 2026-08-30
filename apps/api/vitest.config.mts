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
  },
});
