import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as redis from 'redis';

/**
 * Redis Cache Service
 * Provides caching for expensive queries and frequently accessed data
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private client: redis.RedisClient;
  private readonly ttl: number; // Default TTL in seconds

  constructor(private configService: ConfigService) {
    this.ttl = this.configService.get('CACHE_TTL', 3600); // Default 1 hour

    // Initialize Redis client
    const redisHost = this.configService.get('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get('REDIS_PORT', 6379);
    const redisPassword = this.configService.get('REDIS_PASSWORD');

    const options: redis.ClientOpts = {
      host: redisHost,
      port: redisPort,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          this.logger.warn('Redis connection refused');
          return new Error('End of retry');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      },
    };

    if (redisPassword) {
      options.password = redisPassword;
    }

    this.client = redis.createClient(options);

    this.client.on('error', (err: Error) => {
      this.logger.error('Redis error:', err);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await new Promise<string | null>((resolve, reject) => {
        this.client.get(key, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      if (!data) return null;

      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const data = JSON.stringify(value);
      const timeout = ttl || this.ttl;

      await new Promise<void>((resolve, reject) => {
        if (timeout > 0) {
          this.client.setex(key, timeout, data, (err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          this.client.set(key, data, (err) => {
            if (err) reject(err);
            else resolve();
          });
        }
      });
    } catch (error) {
      this.logger.warn(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete cache key
   */
  async del(key: string): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        this.client.del(key, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      this.logger.warn(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Delete all cache keys matching pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      return await new Promise<number>((resolve, reject) => {
        this.client.keys(pattern, (err, keys) => {
          if (err) {
            reject(err);
          } else if (keys.length === 0) {
            resolve(0);
          } else {
            this.client.del(...keys, (err, count) => {
              if (err) reject(err);
              else resolve(count);
            });
          }
        });
      });
    } catch (error) {
      this.logger.warn(`Cache delete pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      return await new Promise<boolean>((resolve, reject) => {
        this.client.exists(key, (err, exists) => {
          if (err) reject(err);
          else resolve(exists === 1);
        });
      });
    } catch (error) {
      this.logger.warn(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get and cache - pattern for getting or setting cache
   */
  async getOrCache<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached) {
      this.logger.debug(`Cache hit for ${key}`);
      return cached;
    }

    // Cache miss - call function
    this.logger.debug(`Cache miss for ${key}`);
    const data = await fn();

    // Store in cache
    await this.set(key, data, ttl);

    return data;
  }

  /**
   * Increment counter (for rate limiting, stats)
   */
  async increment(key: string, ttl?: number): Promise<number> {
    try {
      return await new Promise<number>((resolve, reject) => {
        this.client.incr(key, (err, count) => {
          if (err) {
            reject(err);
          } else {
            // Set TTL if provided and count is 1 (first time)
            if (ttl && count === 1) {
              this.client.expire(key, ttl, (err) => {
                if (err) reject(err);
                else resolve(count);
              });
            } else {
              resolve(count);
            }
          }
        });
      });
    } catch (error) {
      this.logger.warn(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Flush all cache
   */
  async flushAll(): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        this.client.flushall((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.logger.log('Cache flushed');
    } catch (error) {
      this.logger.error('Cache flush error:', error);
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.client) {
        this.client.quit(() => {
          this.logger.log('Redis connection closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
