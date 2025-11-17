import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dispatches outgoing HTTP webhooks whenever domain events occur.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sends the payload to all active webhook subscriptions that listen to the event.
   *
   * @param event - The event key (e.g. `orders.created`).
   * @param payload - The JSON payload to send to subscribers.
   */
  async dispatch(event: string, payload: unknown) {
    const webhooks = await this.prisma.apiWebhook.findMany({
      where: { event, isActive: true },
    });

    if (!webhooks.length) {
      return;
    }

    await Promise.allSettled(
      webhooks.map(async hook => {
        try {
          await axios.post(
            hook.targetUrl,
            { event, payload },
            {
              timeout: 5_000,
              headers: hook.secret
                ? {
                    'x-webhook-token': hook.secret,
                  }
                : undefined,
            },
          );
          await this.prisma.apiWebhook.update({
            where: { id: hook.id },
            data: { lastTriggeredAt: new Date(), lastError: null },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.prisma.apiWebhook.update({
            where: { id: hook.id },
            data: { lastTriggeredAt: new Date(), lastError: message },
          });
          this.logger.warn(`Webhook ${hook.targetUrl} failed: ${message}`);
        }
      }),
    );
  }
}
