import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_ERROR_HISTORY = 20;

type QueueMetricEvent = {
  queue: string;
  updatedAt: string;
  [key: string]: unknown;
};

type SystemErrorEvent = {
  source: string;
  message: string;
  occurredAt: string;
  details?: unknown;
};

class RealtimeConnection {
  private readonly logger: Logger;
  private readonly onClose: (connection: RealtimeConnection) => void;
  private buffer = Buffer.alloc(0);
  private closed = false;
  private readonly pingInterval: NodeJS.Timeout;

  constructor(private readonly socket: Socket, logger: Logger, onClose: (connection: RealtimeConnection) => void) {
    this.logger = logger;
    this.onClose = onClose;
    this.socket.setNoDelay(true);
    this.socket.setKeepAlive(true, 60_000);
    this.socket.on('data', chunk => this.handleChunk(chunk));
    this.socket.on('close', () => this.cleanup());
    this.socket.on('end', () => this.cleanup());
    this.socket.on('error', error => {
      this.logger.warn(`Realtime socket error: ${error instanceof Error ? error.message : String(error)}`);
      this.cleanup();
    });

    this.pingInterval = setInterval(() => {
      try {
        this.sendFrame(0x9, Buffer.alloc(0));
      } catch (error) {
        this.logger.warn('Realtime ping konnte nicht gesendet werden. Schließe Verbindung.');
        this.cleanup();
      }
    }, 30_000);
  }

  send(event: string, payload: unknown) {
    if (this.closed) {
      return;
    }

    const data = JSON.stringify({ event, payload });
    try {
      this.sendFrame(0x1, Buffer.from(data));
    } catch (error) {
      this.logger.warn(`Realtime-Nachricht konnte nicht gesendet werden: ${String(error)}`);
      this.cleanup();
    }
  }

  close(code = 1000) {
    if (this.closed) {
      return;
    }
    try {
      const closeBuffer = Buffer.alloc(2);
      closeBuffer.writeUInt16BE(code, 0);
      this.sendFrame(0x8, closeBuffer);
    } catch (error) {
      this.logger.debug(`Realtime-Closing-Frame konnte nicht gesendet werden: ${String(error)}`);
    }
    this.cleanup();
  }

  private handleChunk(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const frame = this.extractFrame();
      if (!frame) {
        return;
      }

      const { opcode, data } = frame;

      if (opcode === 0x8) {
        this.close();
        return;
      }

      if (opcode === 0x9) {
        // ping
        this.sendFrame(0xA, data);
        continue;
      }

      if (opcode === 0xA) {
        // pong - ignore
        continue;
      }

      // Currently we do not process incoming text/binary frames.
    }
  }

  private extractFrame(): { opcode: number; data: Buffer } | null {
    if (this.buffer.length < 2) {
      return null;
    }

    const firstByte = this.buffer[0];
    const secondByte = this.buffer[1];
    const opcode = firstByte & 0x0f;
    let offset = 2;

    let payloadLength = secondByte & 0x7f;
    if (payloadLength === 126) {
      if (this.buffer.length < offset + 2) {
        return null;
      }
      payloadLength = this.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (this.buffer.length < offset + 8) {
        return null;
      }
      const length64 = this.buffer.readBigUInt64BE(offset);
      payloadLength = Number(length64);
      offset += 8;
    }

    const isMasked = (secondByte & 0x80) === 0x80;
    let maskingKey: Buffer | undefined;
    if (isMasked) {
      if (this.buffer.length < offset + 4) {
        return null;
      }
      maskingKey = this.buffer.slice(offset, offset + 4);
      offset += 4;
    }

    if (this.buffer.length < offset + payloadLength) {
      return null;
    }

    let payload = this.buffer.slice(offset, offset + payloadLength);
    this.buffer = this.buffer.slice(offset + payloadLength);

    if (isMasked && maskingKey) {
      const unmasked = Buffer.alloc(payloadLength);
      for (let index = 0; index < payloadLength; index += 1) {
        unmasked[index] = payload[index] ^ maskingKey[index % 4];
      }
      payload = unmasked;
    }

    return { opcode, data: payload };
  }

  private sendFrame(opcode: number, data: Buffer) {
    if (this.socket.destroyed) {
      throw new Error('Socket geschlossen');
    }

    const payloadLength = data.length;
    const firstByte = 0x80 | (opcode & 0x0f);
    let header: Buffer;

    if (payloadLength < 126) {
      header = Buffer.from([firstByte, payloadLength]);
    } else if (payloadLength < 65_536) {
      header = Buffer.alloc(4);
      header[0] = firstByte;
      header[1] = 126;
      header.writeUInt16BE(payloadLength, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = firstByte;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(payloadLength), 2);
    }

    const frame = Buffer.concat([header, data]);
    this.socket.write(frame);
  }

  private cleanup() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearInterval(this.pingInterval);
    try {
      this.socket.destroy();
    } catch (error) {
      this.logger.debug(`Socket konnte nicht zerstört werden: ${String(error)}`);
    }
    this.onClose(this);
  }
}

@Injectable()
export class PosRealtimeGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PosRealtimeGateway.name);
  private readonly emitter = new EventEmitter();
  private readonly clients = new Set<RealtimeConnection>();
  private readonly queueMetrics = new Map<string, QueueMetricEvent>();
  private readonly recentErrors: SystemErrorEvent[] = [];
  private httpServer: any;

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  onModuleInit() {
    const httpServer = this.adapterHost?.httpAdapter?.getHttpServer?.();
    if (!httpServer || typeof httpServer.on !== 'function') {
      this.logger.warn('HTTP-Server nicht verfügbar. Realtime-Upgrade kann nicht initialisiert werden.');
      return;
    }
    this.httpServer = httpServer;
    this.httpServer.on('upgrade', this.handleUpgrade);
  }

  onModuleDestroy() {
    if (this.httpServer && typeof this.httpServer.off === 'function') {
      this.httpServer.off('upgrade', this.handleUpgrade);
    }
    this.clients.forEach(client => client.close(1001));
    this.clients.clear();
  }

  on(event: string, listener: (payload: unknown) => void) {
    this.emitter.on(event, listener);
  }

  off(event: string, listener: (payload: unknown) => void) {
    this.emitter.off(event, listener);
  }

  broadcast(event: string, payload: unknown) {
    this.logger.verbose(`Broadcasting POS realtime event ${event}`);
    this.emitter.emit(event, payload);
    this.clients.forEach(client => client.send(event, payload));
  }

  broadcastQueueMetrics(queue: string, metrics: Record<string, unknown>) {
    const payload: QueueMetricEvent = {
      queue,
      updatedAt: new Date().toISOString(),
      ...metrics,
    };
    this.queueMetrics.set(queue, payload);
    this.broadcast('queue.metrics', payload);
  }

  broadcastSystemError(source: string, error: unknown, details?: unknown) {
    const occurredAt = new Date().toISOString();
    const message =
      typeof error === 'string'
        ? error
        : error instanceof Error
        ? error.message
        : 'Unbekannter Fehlerzustand';

    const event: SystemErrorEvent = {
      source,
      message,
      occurredAt,
      details: details ?? (error instanceof Error ? { stack: error.stack } : undefined),
    };

    this.recentErrors.unshift(event);
    if (this.recentErrors.length > MAX_ERROR_HISTORY) {
      this.recentErrors.length = MAX_ERROR_HISTORY;
    }

    this.broadcast('system.error', event);
  }

  private readonly handleUpgrade = (request: IncomingMessage, socket: Socket) => {
    try {
      if (!request.url) {
        socket.destroy();
        return;
      }

      const host = request.headers.host ?? 'localhost';
      const url = new URL(request.url, `http://${host}`);
      if (url.pathname !== '/ws/pos') {
        return;
      }

      const keyHeader = request.headers['sec-websocket-key'];
      if (!keyHeader || Array.isArray(keyHeader)) {
        socket.destroy();
        return;
      }

      const acceptKey = createHash('sha1').update(keyHeader + WS_GUID).digest('base64');
      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        'Sec-WebSocket-Version: 13',
      ];
      socket.write(responseHeaders.concat('\r\n').join('\r\n'));

      const connection = new RealtimeConnection(socket, this.logger, conn => this.removeConnection(conn));
      this.clients.add(connection);
      this.logger.log(`Realtime-Client verbunden (${this.clients.size} aktiv).`);

      this.queueMetrics.forEach(metric => connection.send('queue.metrics', metric));
      this.recentErrors.forEach(error => connection.send('system.error', error));
    } catch (error) {
      this.logger.error(`Upgrade auf WebSocket fehlgeschlagen: ${error instanceof Error ? error.message : error}`);
      try {
        socket.destroy();
      } catch (destroyError) {
        this.logger.debug(`Socket konnte nach fehlgeschlagenem Upgrade nicht zerstört werden: ${destroyError}`);
      }
    }
  };

  private removeConnection(connection: RealtimeConnection) {
    if (this.clients.delete(connection)) {
      this.logger.log(`Realtime-Client getrennt (${this.clients.size} verbleibend).`);
    }
  }
}
