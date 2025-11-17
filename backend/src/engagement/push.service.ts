import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushSubscription } from '@prisma/client';

export type PushPayload = {
  title: string;
  body: string;
  data?: unknown;
};

/**
 * Lightweight abstraction for Web Push/FCM/APNS notifications.
 *
 * The implementation intentionally focuses on consent tracking and logging.
 * Actual push transport can be wired in later (e.g. via web-push, FCM or APNS).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey: string;

  constructor(private readonly config: ConfigService) {
    this.publicKey =
      this.config.get<string>('VAPID_PUBLIC_KEY') ??
      'BIfFakeDemoPublicKey-ReplaceWithRealVapidKeyForProduction';
  }

  getPublicKey() {
    return this.publicKey;
  }

  async sendNotification(subscription: PushSubscription, payload: PushPayload) {
    this.logger.log(
      `Mock push -> ${subscription.endpoint}: ${payload.title} | ${payload.body} (${JSON.stringify(payload.data)})`,
    );
  }
}
