import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerOrder,
  CustomerNotificationPreference,
  DriverLocationUpdate,
  OrderFeedback,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import { WebhookService } from '../realtime/webhook.service';
import { PushService } from './push.service';
import { RegisterPushSubscriptionDto } from '../orders/dto/register-push.dto';
import { UpdateNotificationPreferencesDto } from '../orders/dto/update-notification-preferences.dto';
import { SubmitFeedbackDto } from '../orders/dto/submit-feedback.dto';

export type TrackingSnapshot = {
  order: {
    id: number;
    status: OrderStatus;
    customerName: string;
    deliveryAddress?: string | null;
    totalAmount?: number | null;
    tenantId: string;
    slot: {
      id: number;
      startTime: string;
      endTime: string;
    };
    driverAssignment?: {
      id: number;
      driverName?: string | null;
      vehicleId?: string | null;
      status: string;
      eta?: string | null;
      startedAt?: string | null;
      completedAt?: string | null;
    } | null;
  };
  statusEvents: Array<{ id: number; status: OrderStatus; notes?: string | null; createdAt: string }>;
  driverLocations: Array<{
    id: number;
    latitude: number;
    longitude: number;
    driverStatus?: string | null;
    accuracy?: number | null;
    recordedAt: string;
  }>;
  notificationPreference: CustomerNotificationPreference;
  feedback?: OrderFeedback | null;
  pushPublicKey: string;
  tipSuggestions: number[];
};

@Injectable()
export class OrderEngagementService {
  private readonly logger = new Logger(OrderEngagementService.name);
  private readonly trackingBaseUrl: string;
  private readonly tipSuggestions = [0, 2, 5, 10];

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly realtime: PosRealtimeGateway,
    private readonly webhooks: WebhookService,
    private readonly config: ConfigService,
    private readonly push: PushService,
  ) {
    this.trackingBaseUrl =
      this.config.get<string>('CUSTOMER_APP_BASE_URL') ?? 'http://localhost:5173/order/tracking';
  }

  async recordStatusEvent(orderId: number, status: OrderStatus, notes?: string | null, metadata?: Prisma.JsonValue) {
    await this.prisma.orderStatusEvent.create({
      data: { orderId, status, notes: notes ?? null, metadata: metadata ?? undefined },
    });
  }

  async ensurePreference(order: CustomerOrder, overrides?: Partial<CustomerNotificationPreference>) {
    const existing = await this.prisma.customerNotificationPreference.findUnique({ where: { orderId: order.id } });
    if (existing) {
      if (overrides && Object.keys(overrides).length) {
        return this.prisma.customerNotificationPreference.update({
          where: { orderId: order.id },
          data: overrides,
        });
      }
      return existing;
    }

    return this.prisma.customerNotificationPreference.create({
      data: {
        orderId: order.id,
        allowEmail: Boolean(order.contactEmail ?? overrides?.allowEmail ?? true),
        allowSlotUpdates: overrides?.allowSlotUpdates ?? false,
        allowStatusPush: overrides?.allowStatusPush ?? false,
        consentSource: overrides?.consentSource ?? 'order-flow',
      },
    });
  }

  async getTrackingSnapshot(orderId: number): Promise<TrackingSnapshot> {
    const order = await this.prisma.customerOrder.findUnique({
      where: { id: orderId },
      include: {
        slot: true,
        driverAssignment: true,
        notificationPreference: true,
        feedback: true,
      },
    });
    if (!order) {
      throw new Error(`Bestellung ${orderId} nicht gefunden.`);
    }

    const preference = order.notificationPreference ?? (await this.ensurePreference(order));
    const statusEvents = await this.prisma.orderStatusEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    const locations = await this.prisma.driverLocationUpdate.findMany({
      where: { orderId },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });

    return {
      order: {
        id: order.id,
        status: order.status,
        customerName: order.customerName,
        deliveryAddress: order.deliveryAddress,
        totalAmount: order.totalAmount ? Number(order.totalAmount) : null,
        tenantId: order.tenantId,
        slot: {
          id: order.slot.id,
          startTime: order.slot.startTime.toISOString(),
          endTime: order.slot.endTime.toISOString(),
        },
        driverAssignment: order.driverAssignment
          ? {
              id: order.driverAssignment.id,
              driverName: order.driverAssignment.driverName,
              vehicleId: order.driverAssignment.vehicleId,
              status: order.driverAssignment.status,
              eta: order.driverAssignment.eta ? order.driverAssignment.eta.toISOString() : null,
              startedAt: order.driverAssignment.startedAt ? order.driverAssignment.startedAt.toISOString() : null,
              completedAt: order.driverAssignment.completedAt
                ? order.driverAssignment.completedAt.toISOString()
                : null,
            }
          : null,
      },
      statusEvents: statusEvents.map(event => ({
        id: event.id,
        status: event.status,
        notes: event.notes,
        createdAt: event.createdAt.toISOString(),
      })),
      driverLocations: locations
        .map(location => ({
          id: location.id,
          latitude: location.latitude,
          longitude: location.longitude,
          driverStatus: location.driverStatus,
          accuracy: location.accuracy,
          recordedAt: location.recordedAt.toISOString(),
        }))
        .reverse(),
      notificationPreference: preference,
      feedback: order.feedback,
      pushPublicKey: this.push.getPublicKey(),
      tipSuggestions: this.tipSuggestions,
    };
  }

  async registerPushSubscription(order: CustomerOrder, dto: RegisterPushSubscriptionDto) {
    const subscription = await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: {
        p256dh: dto.keys.p256dh,
        authSecret: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
        tenantId: dto.tenantId ?? order.tenantId,
        order: { connect: { id: order.id } },
        revokedAt: null,
        consentSource: dto.consentSource ?? 'customer-tracking',
      },
      create: {
        orderId: order.id,
        tenantId: dto.tenantId ?? order.tenantId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        authSecret: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
        consentSource: dto.consentSource ?? 'customer-tracking',
      },
    });

    await this.ensurePreference(order, {
      allowStatusPush: dto.allowStatusPush ?? true,
      allowSlotUpdates: dto.allowSlotUpdates ?? true,
      consentSource: dto.consentSource ?? 'customer-tracking',
    });

    return subscription;
  }

  async updateNotificationPreferences(order: CustomerOrder, dto: UpdateNotificationPreferencesDto) {
    const preference = await this.ensurePreference(order);
    return this.prisma.customerNotificationPreference.update({
      where: { orderId: order.id },
      data: {
        allowStatusPush: dto.allowStatusPush ?? preference.allowStatusPush,
        allowSlotUpdates: dto.allowSlotUpdates ?? preference.allowSlotUpdates,
        allowEmail: dto.allowEmail ?? preference.allowEmail,
      },
    });
  }

  async submitFeedback(order: CustomerOrder, dto: SubmitFeedbackDto) {
    const assignment = await this.prisma.driverAssignment.findUnique({ where: { orderId: order.id } });
    return this.prisma.orderFeedback.upsert({
      where: { orderId: order.id },
      update: {
        rating: dto.rating,
        comment: dto.comment ?? null,
        tipAmount: dto.tipAmount !== undefined ? new Prisma.Decimal(dto.tipAmount) : undefined,
        tipCurrency: dto.tipCurrency ?? 'EUR',
        driverMood: dto.driverMood ?? null,
        contactConsent: dto.contactConsent ?? false,
        driverAssignmentId: assignment?.id ?? null,
      },
      create: {
        orderId: order.id,
        rating: dto.rating,
        comment: dto.comment ?? null,
        tipAmount: dto.tipAmount !== undefined ? new Prisma.Decimal(dto.tipAmount) : null,
        tipCurrency: dto.tipCurrency ?? 'EUR',
        driverMood: dto.driverMood ?? null,
        contactConsent: dto.contactConsent ?? false,
        driverAssignmentId: assignment?.id ?? null,
      },
    });
  }

  async notifyStatusChange(order: CustomerOrder, status: OrderStatus) {
    const preference = await this.ensurePreference(order);
    if (preference.allowStatusPush) {
      await this.dispatchPush(order.id, {
        title: `Statusaktualisierung für Bestellung #${order.id}`,
        body: `Neuer Status: ${status.replace(/_/g, ' ')}`,
        data: { url: this.buildTrackingUrl(order.id) },
      });
    }

    if (preference.allowEmail && order.contactEmail) {
      const subject = `Status-Update zu deiner Bestellung #${order.id}`;
      const html = `
        <h2>Hallo ${order.customerName}</h2>
        <p>deine Bestellung ist jetzt im Status <strong>${status.replace(/_/g, ' ')}</strong>.</p>
        <p>Hier kannst du den Fortschritt verfolgen: <a href="${this.buildTrackingUrl(order.id)}">Tracking öffnen</a></p>
      `;
      await this.mailer.sendReceiptEmail(order.contactEmail, subject, html);
    }

    if (status === OrderStatus.DELIVERED) {
      await this.triggerFeedbackAutomation(order, preference);
    }
  }

  async notifySlotUpdate(slot: { id: number; startTime: Date; endTime: Date }) {
    const orders = await this.prisma.customerOrder.findMany({
      where: {
        slotId: slot.id,
        notificationPreference: { allowSlotUpdates: true },
      },
      include: { notificationPreference: true },
    });

    await Promise.all(
      orders.map(order =>
        this.dispatchPush(
          order.id,
          {
            title: 'Slot-Update',
            body: 'Dein Liefer-/Abholslot wurde aktualisiert.',
            data: { url: this.buildTrackingUrl(order.id) },
          },
          false,
        ),
      ),
    );
  }

  async handleDriverLocationUpdate(orderId: number, location: DriverLocationUpdate) {
    this.realtime.broadcast('orders.tracking.location', { orderId, location });
    await this.webhooks.dispatch('orders.tracking.location', { orderId, location });
    await this.dispatchPush(orderId, {
      title: 'Neues Live-Tracking',
      body: 'Unser Fahrer hat gerade seinen Standort aktualisiert.',
      data: { url: this.buildTrackingUrl(orderId) },
    });
  }

  private async dispatchPush(
    orderId: number,
    payload: { title: string; body: string; data?: unknown },
    requiresStatusOptIn = true,
  ) {
    const preference = await this.prisma.customerNotificationPreference.findUnique({ where: { orderId } });
    if (!preference) {
      return;
    }
    if (requiresStatusOptIn && !preference.allowStatusPush) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { orderId, revokedAt: null },
    });

    await Promise.all(
      subscriptions.map(async subscription => {
        try {
          await this.push.sendNotification(subscription, payload);
          await this.prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { lastUsedAt: new Date() },
          });
        } catch (error) {
          this.logger.warn(`Push konnte nicht gesendet werden: ${error}`);
          await this.prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { revokedAt: new Date() },
          });
        }
      }),
    );
  }

  private async triggerFeedbackAutomation(order: CustomerOrder, preference: CustomerNotificationPreference) {
    const link = this.buildTrackingUrl(order.id) + '?feedback=1';
    if (preference.allowStatusPush) {
      await this.dispatchPush(order.id, {
        title: 'Wie war deine Lieferung?',
        body: 'Bewerte Fahrer:in und gib optional ein Trinkgeld.',
        data: { url: link },
      });
    }
    if (preference.allowEmail && order.contactEmail) {
      await this.mailer.sendReceiptEmail(
        order.contactEmail,
        'Bewerte deine Lieferung',
        `<p>Hallo ${order.customerName},</p><p>wie zufrieden warst du? Dein Feedback hilft uns enorm.</p><p><a href="${link}">Feedback geben</a></p>`,
      );
    }
    await this.prisma.customerNotificationPreference.update({
      where: { orderId: order.id },
      data: { feedbackRequestedAt: new Date() },
    });
  }

  private buildTrackingUrl(orderId: number) {
    return `${this.trackingBaseUrl}/${orderId}`;
  }
}
