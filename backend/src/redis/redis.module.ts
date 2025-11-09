import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * A global module that provides and exports the `RedisService`.
 *
 * By making this a global module, the `RedisService` is available for injection
 * in any other module without needing to import `RedisModule` explicitly.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
