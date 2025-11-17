import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTssDto } from './dto/create-tss.dto';
import { UpdateTssDto } from './dto/update-tss.dto';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';

const tssSelect = {
  id: true,
  serialNumber: true,
  description: true,
  state: true,
  certPath: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TssSelect;

const cashRegisterSelect = {
  id: true,
  label: true,
  location: true,
  tenantId: true,
  tssId: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CashRegisterSelect;

@Injectable()
export class TenantConfigService {
  constructor(private readonly prisma: PrismaService) {}

  listTenantProfiles() {
    return this.prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        isDefault: true,
        tsses: {
          select: tssSelect,
          orderBy: { createdAt: 'desc' },
        },
        cashRegisters: {
          select: cashRegisterSelect,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async listTss(tenantId: string) {
    await this.ensureTenantExists(tenantId);
    return this.prisma.tss.findMany({
      where: { tenantId },
      select: tssSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTss(tenantId: string, dto: CreateTssDto) {
    await this.ensureTenantExists(tenantId);

    return this.prisma.tss.create({
      data: {
        id: dto.id.trim(),
        tenantId,
        serialNumber: dto.serialNumber?.trim() || null,
        description: dto.description?.trim() || null,
        state: dto.state?.trim() || null,
        certPath: dto.certPath?.trim() || null,
      },
      select: tssSelect,
    });
  }

  async updateTss(tssId: string, dto: UpdateTssDto) {
    const existing = await this.prisma.tss.findUnique({ where: { id: tssId } });
    if (!existing) {
      throw new NotFoundException(`TSS ${tssId} wurde nicht gefunden.`);
    }

    return this.prisma.tss.update({
      where: { id: tssId },
      data: {
        serialNumber: dto.serialNumber?.trim() ?? dto.serialNumber ?? undefined,
        description: dto.description?.trim() ?? dto.description ?? undefined,
        state: dto.state?.trim() ?? dto.state ?? undefined,
        certPath: dto.certPath?.trim() ?? dto.certPath ?? undefined,
      },
      select: tssSelect,
    });
  }

  async deleteTss(tssId: string) {
    const existing = await this.prisma.tss.findUnique({
      where: { id: tssId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`TSS ${tssId} wurde nicht gefunden.`);
    }

    const registerCount = await this.prisma.cashRegister.count({ where: { tssId } });
    if (registerCount > 0) {
      throw new BadRequestException('TSS kann nicht gelöscht werden, solange Kassen zugeordnet sind.');
    }

    await this.prisma.tss.delete({ where: { id: tssId } });
    return { deleted: true };
  }

  async listCashRegisters(tenantId: string) {
    await this.ensureTenantExists(tenantId);
    return this.prisma.cashRegister.findMany({
      where: { tenantId },
      select: cashRegisterSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCashRegister(tenantId: string, dto: CreateCashRegisterDto) {
    await this.ensureTenantExists(tenantId);
    const normalizedTssId = dto.tssId.trim();
    await this.ensureTssBelongsToTenant(normalizedTssId, tenantId);

    const register = await this.prisma.cashRegister.create({
      data: {
        id: dto.id.trim(),
        tenantId,
        tssId: normalizedTssId,
        label: dto.label?.trim() || null,
        location: dto.location?.trim() || null,
        isDefault: Boolean(dto.isDefault),
      },
      select: cashRegisterSelect,
    });

    if (register.isDefault) {
      await this.unsetOtherDefaultCashRegisters(tenantId, register.id);
    }

    return register;
  }

  async updateCashRegister(registerId: string, dto: UpdateCashRegisterDto) {
    const existing = await this.prisma.cashRegister.findUnique({ where: { id: registerId } });
    if (!existing) {
      throw new NotFoundException(`Kasse ${registerId} wurde nicht gefunden.`);
    }

    let nextTssId: string | undefined;
    if (dto.tssId) {
      nextTssId = dto.tssId.trim();
      await this.ensureTssBelongsToTenant(nextTssId, existing.tenantId);
    }

    const updated = await this.prisma.cashRegister.update({
      where: { id: registerId },
      data: {
        label: dto.label?.trim() ?? dto.label ?? undefined,
        location: dto.location?.trim() ?? dto.location ?? undefined,
        tssId: nextTssId ?? undefined,
        isDefault: dto.isDefault ?? undefined,
      },
      select: cashRegisterSelect,
    });

    if (dto.isDefault) {
      await this.unsetOtherDefaultCashRegisters(updated.tenantId, updated.id);
    }

    return updated;
  }

  async deleteCashRegister(registerId: string) {
    const existing = await this.prisma.cashRegister.findUnique({ where: { id: registerId } });
    if (!existing) {
      throw new NotFoundException(`Kasse ${registerId} wurde nicht gefunden.`);
    }

    await this.prisma.cashRegister.delete({ where: { id: registerId } });
    return { deleted: true };
  }

  private async ensureTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} wurde nicht gefunden.`);
    }
  }

  private async ensureTssBelongsToTenant(tssId: string, tenantId: string) {
    const tss = await this.prisma.tss.findUnique({ where: { id: tssId } });
    if (!tss || tss.tenantId !== tenantId) {
      throw new BadRequestException('Die angegebene TSS gehört nicht zu diesem Tenant.');
    }
  }

  private async unsetOtherDefaultCashRegisters(tenantId: string, exceptId: string) {
    await this.prisma.cashRegister.updateMany({
      where: {
        tenantId,
        id: { not: exceptId },
        isDefault: true,
      },
      data: { isDefault: false },
    });
  }
}
