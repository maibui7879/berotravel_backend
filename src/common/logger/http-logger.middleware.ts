import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from './logger.service';

/**
 * HTTP Logger Middleware
 * Logs all incoming HTTP requests
 */
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  constructor(private logger: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip, headers } = req;
    const userAgent = headers['user-agent'];
    const startTime = Date.now();

    // Capture response
    const originalSend = res.send;

    res.send = function (data: any) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Log the request
      this.logger.logHttpRequest(method, originalUrl, statusCode, duration);

      // Don't log sensitive endpoints
      if (
        !originalUrl.includes('password') &&
        !originalUrl.includes('token') &&
        statusCode >= 400
      ) {
        this.logger.warn(`HTTP ${method} ${originalUrl} - ${statusCode}`, 'HttpLogger', {
          duration,
          ip,
          userAgent,
        });
      }

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  }
}
