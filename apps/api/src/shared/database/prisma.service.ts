import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function buildDatabaseUrl(userVar: string, passwordVar: string): string {
  const host = process.env['DB_HOST'] ?? 'localhost';
  const port = process.env['DB_PORT'] ?? '5432';
  const name = process.env['DB_NAME'];
  const user = process.env[userVar];
  const password = process.env[passwordVar];

  if (!name || !user || !password) {
    throw new Error(
      `Database misconfigured. Ensure DB_NAME, ${userVar}, and ${passwordVar} are set.`,
    );
  }

  const encodedPassword = encodeURIComponent(password);
  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${name}`;
}

/**
 * The application's database connection.
 *
 * Connects as DB_APP_USER, NOT DB_OWNER_USER which runs migrations.
 * The app account cannot alter the schema and cannot UPDATE or DELETE audit history.
 * See docker/postgres/init.sql.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = buildDatabaseUrl('DB_APP_USER', 'DB_APP_PASSWORD');
    super({ datasourceUrl: url });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
