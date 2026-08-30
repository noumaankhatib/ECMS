import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The application's database connection.
 *
 * Note the URL: DATABASE_URL is the ecms_app account, NOT the ecms_owner
 * account the migrations run as. The app account cannot alter the schema, and
 * cannot UPDATE or DELETE audit history. See docker/postgres/init.sql.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = process.env['DATABASE_URL'];
    if (!url) {
      // Fail at startup rather than on the first query.
      throw new Error('DATABASE_URL is not set. The API cannot start without it.');
    }
    super({ datasourceUrl: url });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
