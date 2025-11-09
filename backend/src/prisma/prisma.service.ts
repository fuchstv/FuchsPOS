import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Service that provides a PrismaClient instance and manages its lifecycle.
 *
 * This service extends the PrismaClient and uses NestJS lifecycle hooks
 * (`OnModuleInit`, `OnModuleDestroy`) to automatically connect to and
 * disconnect from the database.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * Connects to the database when the module is initialized.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Disconnects from the database when the module is destroyed.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
