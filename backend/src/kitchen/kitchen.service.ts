import { Injectable } from '@nestjs/common';
import { FulfillmentTaskStatus, FulfillmentTaskType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import { WebhookService } from '../realtime/webhook.service';

export type OrderItemForTask = {
  sku: string;
  quantity: number;
  requiresKitchen?: boolean;
};

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: PosRealtimeGateway,
    private readonly webhooks: WebhookService,
  ) {}

  async createTasksForOrder(orderId: number, items: OrderItemForTask[]) {
    const tasks = [];

    for (const item of items) {
      if (item.requiresKitchen) {
        tasks.push(
          this.prisma.fulfillmentTask.create({
            data: {
              orderId,
              taskType: FulfillmentTaskType.KITCHEN,
              description: `Bereite ${item.quantity}x ${item.sku}`,
            },
          }),
        );
      }

      tasks.push(
        this.prisma.fulfillmentTask.create({
          data: {
            orderId,
            taskType: FulfillmentTaskType.WAREHOUSE,
            description: `Kommissioniere ${item.quantity}x ${item.sku}`,
          },
        }),
      );
    }

    await Promise.all(tasks);
    await this.emitUpdate(orderId);
  }

  async listTasks(tenantId: string, type?: FulfillmentTaskType) {
    return this.prisma.fulfillmentTask.findMany({
      where: {
        taskType: type ?? undefined,
        order: { tenantId },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateTaskStatus(taskId: number, status: FulfillmentTaskStatus, assignee?: string) {
    const task = await this.prisma.fulfillmentTask.update({
      where: { id: taskId },
      data: { status, assignee: assignee ?? undefined },
    });

    await this.emitUpdate(task.orderId);
    return task;
  }

  async handleOrderStatusChange(orderId: number, status: OrderStatus) {
    const nextStatus: FulfillmentTaskStatus | null =
      status === OrderStatus.PREPARING
        ? FulfillmentTaskStatus.IN_PROGRESS
        : status === OrderStatus.READY || status === OrderStatus.OUT_FOR_DELIVERY || status === OrderStatus.DELIVERED
        ? FulfillmentTaskStatus.DONE
        : status === OrderStatus.CANCELLED
        ? FulfillmentTaskStatus.CANCELLED
        : null;

    if (!nextStatus) {
      return;
    }

    await this.prisma.fulfillmentTask.updateMany({
      where: { orderId },
      data: { status: nextStatus },
    });
    await this.emitUpdate(orderId);
  }

  private async emitUpdate(orderId: number) {
    const tasks = await this.prisma.fulfillmentTask.findMany({ where: { orderId } });
    this.realtime.broadcast('kitchen.tasks.updated', { orderId, tasks });
    await this.webhooks.dispatch('kitchen.tasks.updated', { orderId, tasks });
  }
}
