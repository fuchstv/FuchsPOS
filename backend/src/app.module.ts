import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { PosModule } from './pos/pos.module';
import { HardwareModule } from './hardware/hardware.module';
import { MailerModule } from './mailer/mailer.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    HealthModule,
    HardwareModule,
    MailerModule,
    FiscalModule,
    PosModule,
    InventoryModule,
  ],
})
export class AppModule {}
