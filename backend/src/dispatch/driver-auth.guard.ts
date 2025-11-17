import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class DriverAuthGuard implements CanActivate {
  private readonly expectedKey = process.env.DRIVER_API_KEY ?? 'demo-driver-key';

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided =
      (request.headers['x-driver-api-key'] as string | undefined) ||
      (request.headers['x-api-key'] as string | undefined) ||
      (request.query?.driverKey as string | undefined);

    if (!provided || provided !== this.expectedKey) {
      throw new UnauthorizedException('Ungültiger Fahrer-API-Schlüssel.');
    }

    return true;
  }
}
