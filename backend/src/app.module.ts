import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { PosModule } from './pos/pos.module';
import { HardwareModule } from './hardware/hardware.module';
import { MailerModule } from './mailer/mailer.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { InventoryModule } from './inventory/inventory.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PreordersModule } from './preorders/preorders.module';
import { WoltModule } from './wolt/wolt.module';
import { ReportingModule } from './reporting/reporting.module';
import { AccountingModule } from './accounting/accounting.module';
import { AccessControlModule } from './access-control/access-control.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    HealthModule,
    HardwareModule,
    MailerModule,
    FiscalModule,
    PosModule,
    InventoryModule,
    RealtimeModule,
    PreordersModule,
    WoltModule,
    ReportingModule,
    AccountingModule,
    AccessControlModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
