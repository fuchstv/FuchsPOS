import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * A global module that provides and exports the `PrismaService`.
 *
 * By making this a global module, the `PrismaService` is available for injection
 * in any other module without needing to import `PrismaModule` explicitly.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
