import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Service for interacting with Redis.
 *
 * This service provides a wrapper around the `ioredis` client, managing the connection
 * lifecycle and offering convenience methods for common operations like getting and setting JSON.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initializes the Redis client and connects to the server when the module is initialized.
   */
  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  }

  /**
   * Disconnects from the Redis server when the module is destroyed.
   */
  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  /**
   * Returns the underlying `ioredis` client instance.
   * @returns The Redis client.
   */
  getClient() {
    return this.client;
  }

  /**
   * Pings the Redis server to check the connection.
   * @returns A promise that resolves to the server's response (usually 'PONG').
   */
  async ping() {
    return this.client.ping();
  }

  /**
   * Serializes a JavaScript object to JSON and stores it in Redis.
   * @param key The key to store the value under.
   * @param value The object to store.
   * @param ttlSeconds Optional time-to-live for the key, in seconds.
   */
  async setJson<T>(key: string, value: T, ttlSeconds?: number) {
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, payload);
    }
  }

  /**
   * Retrieves a JSON string from Redis and deserializes it into a JavaScript object.
   * @param key The key of the value to retrieve.
   * @returns A promise that resolves to the deserialized object, or null if the key does not exist.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const payload = await this.client.get(key);
    return payload ? (JSON.parse(payload) as T) : null;
  }
}
