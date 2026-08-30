import { Global, Module } from '@nestjs/common';

import { RateLimiter } from '../http/rate-limit';

import { PrismaService } from './prisma.service';

/**
 * Global infrastructure: the database connection and the rate limiter.
 *
 * Global because every module that stores anything needs the connection, and
 * re-importing it in each one would be noise rather than a meaningful boundary.
 *
 * This is infrastructure, not a business module — the boundary rules that keep
 * business modules apart do not apply to it.
 */
@Global()
@Module({ providers: [PrismaService, RateLimiter], exports: [PrismaService, RateLimiter] })
export class DatabaseModule {}
