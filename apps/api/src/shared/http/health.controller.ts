import { Controller, Get } from '@nestjs/common';

import { Public } from '../../modules/access';
import { PrismaService } from '../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — is the process up. Deliberately touches nothing else. */
  @Public()
  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  /** Readiness — can it actually serve, i.e. is the database reachable. */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: string; database: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok' };
  }
}
