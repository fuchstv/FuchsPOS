import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CashRegisterInfo, FiscalContext, TenantInfo, TssInfo } from './types';

/**
 * Service for managing fiscalization entities like tenants, TSS, and cash registers.
 */
@Injectable()
export class FiscalManagementService {
  private readonly logger = new Logger(FiscalManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Lists all tenants with their associated cash registers and TSSes.
   * @returns A promise that resolves to a list of tenants.
   */
  async listTenants() {
    return this.prisma.tenant.findMany({
      include: {
        cashRegisters: true,
        tsses: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Creates or updates a tenant.
   * @param data - The data for creating or updating the tenant.
   * @returns A promise that resolves to the created or updated tenant.
   */
  async upsertTenant(data: Prisma.TenantCreateInput & { id?: string }) {
    if (data.id) {
      return this.prisma.tenant.update({
        where: { id: data.id },
        data,
      });
    }

    return this.prisma.tenant.create({ data });
  }

  /**
   * Sets a tenant as the default.
   * @param id - The ID of the tenant to set as default.
   */
  async setDefaultTenant(id: string) {
    await this.prisma.$transaction([
      this.prisma.tenant.updateMany({ data: { isDefault: false } }),
      this.prisma.tenant.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  /**
   * Creates or updates a TSS (Technical Security System).
   * @param data - The data for creating or updating the TSS.
   * @returns A promise that resolves to the created or updated TSS.
   */
  async upsertTss(data: Prisma.TssCreateInput & { id: string }) {
    return this.prisma.tss.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  /**
   * Creates or updates a cash register.
   * @param data - The data for creating or updating the cash register.
   * @returns A promise that resolves to the created or updated cash register.
   */
  async upsertCashRegister(data: Prisma.CashRegisterCreateInput & { id: string }) {
    const created = await this.prisma.cashRegister.upsert({
      where: { id: data.id },
      create: data,
      update: data,
      include: { tenant: true },
    });

    return created;
  }

  /**
   * Sets a cash register as the default for its tenant.
   * @param id - The ID of the cash register to set as default.
   */
  async setDefaultCashRegister(id: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!register) {
      throw new Error(`Kasse ${id} wurde nicht gefunden`);
    }

    await this.prisma.$transaction([
      this.prisma.cashRegister.updateMany({
        where: { tenantId: register.tenantId },
        data: { isDefault: false },
      }),
      this.prisma.cashRegister.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  /**
   * Gets the active fiscal context (tenant, TSS, cash register).
   *
   * It first tries to find the default tenant and cash register from the database.
   * If not found, it falls back to loading the context from environment variables.
   *
   * @returns A promise that resolves to the active fiscal context, or null if none is found.
   */
  async getActiveContext(): Promise<FiscalContext | null> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { isDefault: true },
      include: {
        tsses: true,
        cashRegisters: {
          include: { tss: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (tenant) {
      const cashRegister =
        tenant.cashRegisters.find(register => register.isDefault) ?? tenant.cashRegisters[0];
      const tssRecord = cashRegister?.tss ?? tenant.tsses.find(record => record.id === cashRegister?.tssId);

      if (!cashRegister || !tssRecord) {
        this.logger.warn('Kein aktiver TSS-/Kassenkontext gefunden');
        return null;
      }

      return {
        tenant: this.mapTenant(tenant),
        cashRegister: this.mapCashRegister(cashRegister),
        tss: this.mapTss(tssRecord),
      };
    }

    return this.loadContextFromEnv();
  }

  /**
   * Maps a Prisma tenant object to a TenantInfo object.
   * @param tenant - The Prisma tenant object.
   * @returns The mapped TenantInfo object.
   */
  private mapTenant(
    tenant: Prisma.TenantGetPayload<{ include: { cashRegisters: true; tsses: true } }>,
  ): TenantInfo {
    return {
      id: tenant.id,
      name: tenant.name,
      fiskalyApiKey: tenant.fiskalyApiKey,
      fiskalyApiSecret: tenant.fiskalyApiSecret,
      fiskalyClientId: tenant.fiskalyClientId,
    };
  }

  /**
   * Maps a Prisma cash register object to a CashRegisterInfo object.
   * @param register - The Prisma cash register object.
   * @returns The mapped CashRegisterInfo object.
   */
  private mapCashRegister(
    register: Prisma.CashRegisterGetPayload<{ include: { tss: true } }>,
  ): CashRegisterInfo {
    return {
      id: register.id,
      label: register.label ?? undefined,
    };
  }

  /**
   * Maps a Prisma TSS object to a TssInfo object.
   * @param tss - The Prisma TSS object.
   * @returns The mapped TssInfo object.
   */
  private mapTss(tss: Prisma.TssGetPayload<{ include?: { cashRegisters?: true } }>): TssInfo {
    return {
      id: tss.id,
      serialNumber: tss.serialNumber ?? undefined,
      description: tss.description ?? undefined,
      state: tss.state ?? undefined,
    };
  }

  /**
   * Loads the fiscal context from environment variables.
   * @returns The fiscal context, or null if the required environment variables are not set.
   */
  private loadContextFromEnv(): FiscalContext | null {
    const apiKey = this.config.get<string>('FISKALY_API_KEY');
    const apiSecret = this.config.get<string>('FISKALY_API_SECRET');
    const clientId = this.config.get<string>('FISKALY_CLIENT_ID');
    const tenantName = this.config.get<string>('FISKALY_TENANT_NAME', { infer: true }) ?? 'Standard Mandant';
    const tssId = this.config.get<string>('FISKALY_TSS_ID');
    const tssSerial = this.config.get<string>('FISKALY_TSS_SERIAL');
    const tssDescription = this.config.get<string>('FISKALY_TSS_DESCRIPTION');
    const cashRegisterId = this.config.get<string>('FISKALY_CASH_REGISTER_ID');
    const cashRegisterLabel = this.config.get<string>('FISKALY_CASH_REGISTER_LABEL');

    if (!apiKey || !apiSecret || !clientId || !tssId || !cashRegisterId) {
      this.logger.warn('Fiskaly-Konfiguration unvollständig – Fiskalisierung deaktiviert');
      return null;
    }

    return {
      tenant: {
        id: clientId,
        name: tenantName,
        fiskalyApiKey: apiKey,
        fiskalyApiSecret: apiSecret,
        fiskalyClientId: clientId,
      },
      tss: {
        id: tssId,
        serialNumber: tssSerial ?? undefined,
        description: tssDescription ?? undefined,
      },
      cashRegister: {
        id: cashRegisterId,
        label: cashRegisterLabel ?? undefined,
      },
    };
  }
}
