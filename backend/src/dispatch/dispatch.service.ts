import { Injectable } from '@nestjs/common';
import { DriverAssignmentStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PosRealtimeGateway } from '../realtime/realtime.gateway';
import { WebhookService } from '../realtime/webhook.service';
import { PlanDriverDto } from './dto/plan-driver.dto';

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: PosRealtimeGateway,
    private readonly webhooks: WebhookService,
  ) {}

  async ensureAssignment(orderId: number) {
    const assignment = await this.prisma.driverAssignment.upsert({
      where: { orderId },
      update: {},
      create: { orderId },
    });
    await this.emit(orderId);
    return assignment;
  }

  async planDriver(dto: PlanDriverDto) {
    const assignment = await this.prisma.driverAssignment.upsert({
      where: { orderId: dto.orderId },
      update: {
        driverName: dto.driverName,
        vehicleId: dto.vehicleId ?? null,
        eta: dto.eta ? new Date(dto.eta) : null,
        status: DriverAssignmentStatus.PLANNED,
        startedAt: null,
        completedAt: null,
      },
      create: {
        orderId: dto.orderId,
        driverName: dto.driverName,
        vehicleId: dto.vehicleId ?? null,
        eta: dto.eta ? new Date(dto.eta) : null,
      },
    });
    await this.emit(dto.orderId);
    return assignment;
  }

  async listAssignments(tenantId: string) {
    return this.prisma.driverAssignment.findMany({
      where: { order: { tenantId } },
      include: { order: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAssignmentStatus(id: number, status: DriverAssignmentStatus) {
    const assignment = await this.prisma.driverAssignment.update({
      where: { id },
      data: {
        status,
        startedAt: status === DriverAssignmentStatus.EN_ROUTE ? new Date() : undefined,
        completedAt:
          status === DriverAssignmentStatus.DELIVERED || status === DriverAssignmentStatus.FAILED
            ? new Date()
            : undefined,
      },
      include: { order: true },
    });

    await this.emit(assignment.orderId);
    return assignment;
  }

  async handleOrderStatusChange(orderId: number, status: OrderStatus) {
    const assignment = await this.prisma.driverAssignment.findUnique({ where: { orderId } });
    if (!assignment) {
      return;
    }

    if (status === OrderStatus.OUT_FOR_DELIVERY) {
      await this.prisma.driverAssignment.update({
        where: { orderId },
        data: {
          status: DriverAssignmentStatus.EN_ROUTE,
          startedAt: new Date(),
        },
      });
    } else if (status === OrderStatus.DELIVERED) {
      await this.prisma.driverAssignment.update({
        where: { orderId },
        data: {
          status: DriverAssignmentStatus.DELIVERED,
          completedAt: new Date(),
        },
      });
    } else if (status === OrderStatus.CANCELLED) {
      await this.prisma.driverAssignment.update({
        where: { orderId },
        data: {
          status: DriverAssignmentStatus.FAILED,
          completedAt: new Date(),
        },
      });
    }

    await this.emit(orderId);
  }

  private async emit(orderId: number) {
    const assignment = await this.prisma.driverAssignment.findUnique({
      where: { orderId },
      include: { order: true },
    });
    if (!assignment) {
      return;
    }
    this.realtime.broadcast('dispatch.assignments.updated', assignment);
    await this.webhooks.dispatch('dispatch.assignments.updated', assignment);
  }

}
