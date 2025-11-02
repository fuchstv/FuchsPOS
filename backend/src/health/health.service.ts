import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    const timestamp = new Date().toISOString();

    const dbStatus = await this.checkDatabase();
    const cacheStatus = await this.checkCache();

    return {
      status: dbStatus === 'up' && cacheStatus === 'up' ? 'ok' : 'degraded',
      timestamp,
      dependencies: {
        database: dbStatus,
        cache: cacheStatus,
      },
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error) {
      console.error('Database health check failed', error);
      return 'down';
    }
  }

  private async checkCache(): Promise<'up' | 'down'> {
    try {
      await this.redis.ping();
      return 'up';
    } catch (error) {
      console.error('Redis health check failed', error);
      return 'down';
    }
  }
}
