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

    // [QUAN TRỌNG] Lưu lại instance của logger vào biến cục bộ
    const loggerInstance = this.logger;

    // Capture response
    const originalSend = res.send;

    res.send = function (data: any) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Dùng biến loggerInstance thay cho this.logger
      loggerInstance.logHttpRequest(method, originalUrl, statusCode, duration);

      // Don't log sensitive endpoints
      if (
        !originalUrl.includes('password') &&
        !originalUrl.includes('token') &&
        statusCode >= 400
      ) {
        loggerInstance.warn(`HTTP ${method} ${originalUrl} - ${statusCode}`, 'HttpLogger', {
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