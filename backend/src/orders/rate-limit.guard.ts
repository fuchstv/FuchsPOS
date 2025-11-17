import { CanActivate, ExecutionContext, Injectable, TooManyRequestsException } from '@nestjs/common';
import type { Request } from 'express';

type Entry = { count: number; resetAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, Entry>();
  private readonly limit = Number(process.env.CUSTOMER_RATE_LIMIT ?? 60);
  private readonly windowMs = Number(process.env.CUSTOMER_RATE_WINDOW_MS ?? 60_000);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { ip?: string }>();
    const ip = request.ip || request.headers['x-forwarded-for']?.toString() || request.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = this.hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      this.hits.set(ip, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.limit) {
      throw new TooManyRequestsException('Zu viele Bestellungen in kurzer Zeit. Bitte später erneut versuchen.');
    }

    entry.count += 1;
    return true;
  }
}
