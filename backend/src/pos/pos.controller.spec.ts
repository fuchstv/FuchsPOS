import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PosController } from './pos.controller';

const createController = () => {
  const posService = {
    getCart: jest.fn(),
  } as any;

  const controller = new PosController(posService, {} as any);

  return { controller, posService };
};

describe('PosController - getCart', () => {
  it('requires a terminal identifier', async () => {
    const { controller } = createController();

    await expect(controller.getCart(undefined as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates loading to the service', async () => {
    const { controller, posService } = createController();
    const payload = { cart: { terminalId: 'T-1' }, ttlSeconds: 100 };
    posService.getCart.mockResolvedValue(payload);

    await expect(controller.getCart('T-1')).resolves.toEqual(payload);
    expect(posService.getCart).toHaveBeenCalledWith('T-1');
  });

  it('bubbles up service errors', async () => {
    const { controller, posService } = createController();
    posService.getCart.mockRejectedValue(new NotFoundException());

    await expect(controller.getCart('T-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
