import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PosService } from './pos.service';

const createService = (overrides: Partial<{ ttl: number; cart: any }> = {}) => {
  const ttlMock = jest.fn().mockResolvedValue(overrides.ttl ?? 1200);
  const redis = {
    getJson: jest.fn().mockResolvedValue(overrides.cart ?? { items: [], updatedAt: new Date().toISOString() }),
    getClient: jest.fn().mockReturnValue({ ttl: ttlMock, del: jest.fn() }),
  } as any;

  const service = new PosService(
    {} as any,
    redis,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { service, ttlMock, redis };
};

describe('PosService - getCart', () => {
  it('returns the cached cart and ttl information', async () => {
    const cart = { terminalId: 'T-1', items: [{ id: 'espresso', quantity: 1 }], updatedAt: new Date().toISOString() };
    const { service, ttlMock, redis } = createService({ cart, ttl: 3599 });

    const result = await service.getCart('T-1');

    expect(redis.getJson).toHaveBeenCalledWith('pos:cart:T-1');
    expect(ttlMock).toHaveBeenCalledWith('pos:cart:T-1');
    expect(result).toEqual({ cart, ttlSeconds: 3599 });
  });

  it('throws when the cart has expired', async () => {
    const { service } = createService({ ttl: 0 });

    await expect(service.getCart('T-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when no cart exists for the terminal', async () => {
    const { service, redis } = createService({ cart: null, ttl: -2 });

    redis.getJson.mockResolvedValueOnce(null);

    await expect(service.getCart('T-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
