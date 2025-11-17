import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Simple API-key based guard for customer facing endpoints.
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  private readonly expectedKey = process.env.CUSTOMER_API_KEY ?? 'demo-customer-key';

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { ip?: string }>();
    const provided =
      (request.headers['x-pos-api-key'] as string | undefined) ||
      (request.headers['x-api-key'] as string | undefined) ||
      (request.query?.apiKey as string | undefined);

    if (!provided || provided !== this.expectedKey) {
      throw new UnauthorizedException('Ungültiger API-Schlüssel für Kundenendpunkt.');
    }

    return true;
  }
}
