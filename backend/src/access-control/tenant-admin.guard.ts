import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

export type TenantAdminContext = {
  tenantId: string;
  email?: string | null;
};

export type TenantAdminRequest = Request & {
  tenantAdmin?: TenantAdminContext;
};

/**
 * API-key based guard that scopes requests to a tenant admin context.
 */
@Injectable()
export class TenantAdminGuard implements CanActivate {
  private readonly expectedKey = process.env.TENANT_ADMIN_API_KEY ?? 'demo-tenant-admin-key';

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantAdminRequest>();
    const provided =
      (request.headers['x-tenant-admin-key'] as string | undefined) ||
      (request.headers['x-api-key'] as string | undefined);

    if (!provided || provided !== this.expectedKey) {
      throw new UnauthorizedException('Tenant-Admin-Authentifizierung fehlgeschlagen.');
    }

    const tenantId = this.extractTenantId(request);

    request.tenantAdmin = {
      tenantId,
      email: (request.headers['x-tenant-admin-email'] as string | undefined) ?? null,
    };

    return true;
  }

  private extractTenantId(request: Request) {
    const headerTenant = (request.headers['x-tenant-id'] as string | undefined)?.trim();
    const queryTenant = (request.query?.tenantId as string | undefined)?.trim();
    const tenantId = headerTenant || queryTenant;

    if (!tenantId) {
      throw new BadRequestException('Für diesen Endpunkt muss eine Tenant-ID angegeben werden.');
    }

    return tenantId;
  }
}
