import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Service for checking the health of the application and its dependencies.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Checks the health of the application and its dependencies.
   *
   * @returns A promise that resolves to an object containing the health status.
   */
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

  /**
   * Checks the health of the database.
   *
   * @returns A promise that resolves to 'up' or 'down'.
   */
  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error) {
      console.error('Database health check failed', error);
      return 'down';
    }
  }

  /**
   * Checks the health of the Redis cache.
   *
   * @returns A promise that resolves to 'up' or 'down'.
   */
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
