import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

@Injectable()
export class PosRealtimeGateway {
  private readonly logger = new Logger(PosRealtimeGateway.name);
  private readonly emitter = new EventEmitter();

  on(event: string, listener: (payload: unknown) => void) {
    this.emitter.on(event, listener);
  }

  off(event: string, listener: (payload: unknown) => void) {
    this.emitter.off(event, listener);
  }

  broadcast(event: string, payload: unknown) {
    this.logger.verbose(`Broadcasting POS realtime event ${event}`);
    this.emitter.emit(event, payload);
  }
}
