import { BadRequestException, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TenantAdminGuard } from '../../src/access-control/tenant-admin.guard';

describe('TenantAdminGuard', () => {
  const previousKey = process.env.TENANT_ADMIN_API_KEY;
  let guard: TenantAdminGuard;

  beforeEach(() => {
    process.env.TENANT_ADMIN_API_KEY = 'super-secret-admin-key';
    guard = new TenantAdminGuard();
  });

  afterAll(() => {
    process.env.TENANT_ADMIN_API_KEY = previousKey;
  });

  it('attaches the tenant context when headers are valid', () => {
    const request: any = {
      headers: {
        'x-tenant-admin-key': 'super-secret-admin-key',
        'x-tenant-id': 'tenant-42',
      },
    };
    const context = mockContext(request);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.tenantAdmin).toEqual({ tenantId: 'tenant-42', email: null });
  });

  it('throws when the API key is missing or invalid', () => {
    const request: any = { headers: { 'x-tenant-id': 'tenant-42' } };
    const context = mockContext(request);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('requires a tenant id header or query parameter', () => {
    const request: any = { headers: { 'x-tenant-admin-key': 'super-secret-admin-key' }, query: {} };
    const context = mockContext(request);

    expect(() => guard.canActivate(context)).toThrow(BadRequestException);
  });
});

function mockContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
