type Listener = (payload?: any) => void;

type ListenerMap = Map<string, Set<Listener>>;

export type RealtimeConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private readonly listeners: ListenerMap = new Map();
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private closed = false;
  private status: RealtimeConnectionStatus = 'connecting';

  private readonly baseDelay: number;
  private readonly maxDelay: number;

  constructor(private readonly url: string, options?: { baseDelay?: number; maxDelay?: number }) {
    this.baseDelay = options?.baseDelay ?? 2000;
    this.maxDelay = options?.maxDelay ?? 30000;

    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  getStatus(): RealtimeConnectionStatus {
    return this.status;
  }

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const bucket = this.listeners.get(event)!;
    bucket.add(listener);

    return () => this.off(event, listener);
  }

  off(event: string, listener: Listener) {
    const bucket = this.listeners.get(event);
    if (!bucket) {
      return;
    }
    bucket.delete(listener);
    if (bucket.size === 0) {
      this.listeners.delete(event);
    }
  }

  reconnect() {
    this.closed = false;
    this.reconnectAttempts = 0;
    if (this.ws) {
      try {
        this.ws.close(1000, 'manual-reconnect');
      } catch (error) {
        console.warn('Realtime reconnect failed to close socket', error);
        this.connect();
      }
    } else {
      this.connect();
    }
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.close(1000, 'client-closed');
      } catch (error) {
        console.warn('Realtime close failed', error);
      }
    } else if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.warn('Realtime close failed', error);
      }
    }
    this.ws = null;
  }

  private connect() {
    if (this.closed || typeof window === 'undefined') {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close(1000, 'reconnect');
    }

    this.status = 'connecting';
    this.emit('status', this.status);

    try {
      const socket = new WebSocket(this.url);
      this.ws = socket;

      socket.onopen = () => {
        this.status = 'connected';
        this.reconnectAttempts = 0;
        this.emit('connect');
        this.emit('status', this.status);
      };

      socket.onclose = event => {
        this.ws = null;
        this.status = 'disconnected';
        this.emit('disconnect', { code: event.code, reason: event.reason, wasClean: event.wasClean });
        this.emit('status', this.status);
        if (!this.closed) {
          this.scheduleReconnect();
        }
      };

      socket.onerror = event => {
        const message = event instanceof ErrorEvent ? event.message : 'Unbekannter WebSocket-Fehler';
        this.emit('error', { message });
      };

      socket.onmessage = event => {
        const raw = typeof event.data === 'string' ? event.data : this.extractData(event.data);
        if (!raw) {
          return;
        }

        try {
          const parsed = JSON.parse(raw) as { event?: string; payload?: unknown };
          if (parsed?.event) {
            this.emit(parsed.event, parsed.payload);
          }
        } catch (error) {
          console.warn('Konnte Realtime-Nachricht nicht parsen', error, raw);
        }
      };
    } catch (error) {
      this.status = 'disconnected';
      this.emit('status', this.status);
      this.emit('error', { message: error instanceof Error ? error.message : 'Verbindung fehlgeschlagen' });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.closed || typeof window === 'undefined') {
      return;
    }

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(this.baseDelay * 2 ** this.reconnectAttempts, this.maxDelay);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay + Math.floor(Math.random() * 500));
  }

  private emit(event: string, payload?: unknown) {
    const bucket = this.listeners.get(event);
    if (!bucket) {
      return;
    }
    bucket.forEach(listener => {
      try {
        listener(payload);
      } catch (error) {
        console.error(`Fehler beim Ausführen des Realtime-Listeners für ${event}`, error);
      }
    });
  }

  private extractData(data: any): string | null {
    if (typeof data === 'string') {
      return data;
    }

    if (data instanceof Blob) {
      console.warn('Blob-Nachrichten werden nicht unterstützt.');
      return null;
    }

    if (data instanceof ArrayBuffer) {
      return new TextDecoder().decode(data);
    }

    if (ArrayBuffer.isView(data)) {
      return new TextDecoder().decode(data.buffer);
    }

    return null;
  }
}

export function buildRealtimeUrl(namespace: string) {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

  let resolved: URL;
  if (apiUrl.startsWith('http')) {
    resolved = new URL(apiUrl);
  } else {
    const fallbackBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    resolved = new URL(apiUrl, fallbackBase);
  }

  const pathname = resolved.pathname.replace(/\/?api$/, '');
  const normalisedPath = pathname === '/' ? '' : pathname.replace(/\/$/, '');
  const wsProtocol = resolved.protocol === 'https:' ? 'wss:' : 'ws:';

  return `${wsProtocol}//${resolved.host}${normalisedPath}/ws/${namespace}`;
}
