import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: RedisClientType;
  private readonly ttl: number;

  constructor(private configService: ConfigService) {
    this.ttl = this.configService.get<number>('CACHE_TTL', 3600);

    const redisHost = this.configService.get('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get('REDIS_PORT', 6379);
    const redisPassword = this.configService.get('REDIS_PASSWORD');

    this.client = createClient({
      socket: { host: redisHost, port: redisPort },
      password: redisPassword,
    }) as RedisClientType;

    this.client.on('error', (err) => this.logger.error('Redis error:', err));
    this.client.on('connect', () => this.logger.log('Redis connected'));

    // Khởi động kết nối
    this.client.connect().catch(err => this.logger.error('Redis connect fail', err));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) as T : null;
    } catch (error) {
      this.logger.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const data = JSON.stringify(value);
      const timeout = ttl || this.ttl;
      if (timeout > 0) {
        await this.client.setEx(key, timeout, data);
      } else {
        await this.client.set(key, data);
      }
    } catch (error) {
      this.logger.warn(`Cache set error for key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Cache delete error for key ${key}:`, error);
    }
  }

  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        return await this.client.del(keys);
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) > 0;
    } catch (error) {
      return false;
    }
  }

  async getOrCache<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached) return cached;
    const data = await fn();
    await this.set(key, data, ttl);
    return data;
  }

  async increment(key: string, ttl?: number): Promise<number> {
    try {
      const count = await this.client.incr(key);
      if (ttl && count === 1) {
        await this.client.expire(key, ttl);
      }
      return count;
    } catch (error) {
      return 0;
    }
  }

  async flushAll(): Promise<void> {
    try {
      await this.client.flushAll();
    } catch (error) {
      this.logger.error('Cache flush error:', error);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    }
  }

  async onModuleDestroy() {
    await this.close();
  }
}