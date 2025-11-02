import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: 'pos', cors: { origin: '*' } })
export class PosRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PosRealtimeGateway.name);

  @WebSocketServer()
  server?: Server;

  handleConnection(client: Socket) {
    this.logger.verbose(`POS client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.verbose(`POS client disconnected: ${client.id}`);
  }

  broadcast(event: string, payload: unknown) {
    if (!this.server) {
      this.logger.warn(`Tried to broadcast event ${event} but gateway not initialised`);
      return;
    }

    this.server.emit(event, payload);
  }
}
