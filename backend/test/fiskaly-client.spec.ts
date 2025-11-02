import { ConfigService } from '@nestjs/config';
import { FiskalyClientService } from '../src/fiscal/fiskaly-client.service';

declare const process: NodeJS.Process;

const requiredEnv = [
  'FISKALY_API_KEY',
  'FISKALY_API_SECRET',
  'FISKALY_TSS_ID',
  'FISKALY_CLIENT_ID',
  'FISKALY_CASH_REGISTER_ID',
] as const;

const missing = requiredEnv.filter(name => !process.env[name]);

(missing.length ? describe.skip : describe)(`FiskalyClientService integration`, () => {
  let service: FiskalyClientService;
  const config = new ConfigService();

  beforeAll(() => {
    service = new FiskalyClientService(config);
  });

  it('start, update and finish transaction', async () => {
    const tssId = process.env.FISKALY_TSS_ID as string;
    const clientId = process.env.FISKALY_CLIENT_ID as string;
    const cashRegisterId = process.env.FISKALY_CASH_REGISTER_ID as string;

    const start = await service.startTransaction(tssId, {
      type: 'RECEIPT',
      client_id: clientId,
      cash_register_id: cashRegisterId,
    });

    expect(start.id).toBeDefined();

    const schema = {
      receipt: {
        receipt_number: `JEST-${Date.now()}`,
        receipt_date: new Date().toISOString(),
        items: [
          { text: 'Integrationstest', amount: 1.07, quantity: 1 },
        ],
        amounts_per_vat_rate: [
          { vat_rate: 7, amount: 1.07, amount_net: 1, amount_tax: 0.07 },
        ],
        payments: [{ type: 'CASH', amount: 1.07 }],
      },
    };

    const updated = await service.updateTransaction(tssId, start.id, {
      schema: { standard_v1: schema },
    });

    expect(updated.id).toEqual(start.id);

    const finished = await service.finishTransaction(tssId, start.id, {});

    expect(finished.id).toEqual(start.id);
    expect(finished.signature?.value).toBeDefined();
  }, 30000);
});

if (missing.length) {
  describe('FiskalyClientService integration', () => {
    it('skipped because sandbox credentials are missing', () => {
      console.warn(
        `Fiskaly sandbox tests wurden übersprungen: fehlende Variablen ${missing.join(', ')}`,
      );
    });
  });
}
