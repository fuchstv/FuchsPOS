import type { ExecutionContext } from '@nestjs/common';
import { RateLimitGuard } from '../src/orders/rate-limit.guard';

describe('RateLimitGuard', () => {
  const createContext = (ip: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ ip, headers: {}, socket: {} }) as any,
      }),
    } as ExecutionContext);

  beforeEach(() => {
    process.env.CUSTOMER_RATE_LIMIT = '5';
    process.env.CUSTOMER_RATE_WINDOW_MS = '1000';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('removes expired entries before handling new requests', () => {
    const guard = new RateLimitGuard();
    const now = new Date('2024-01-01T00:00:00.000Z');
    jest.setSystemTime(now);

    const hits = (guard as any).hits as Map<string, { count: number; resetAt: number }>;
    hits.set('stale-ip', { count: 2, resetAt: now.getTime() - 100 });

    guard.canActivate(createContext('fresh-ip'));

    expect(hits.has('stale-ip')).toBe(false);
    expect(hits.has('fresh-ip')).toBe(true);
    expect(hits.size).toBe(1);
  });
});
