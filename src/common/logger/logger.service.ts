import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Winston Logger Service
 * Provides centralized logging with file rotation and formatting
 */
@Injectable()
export class LoggerService {
  private logger: winston.Logger;

  constructor(private configService: ConfigService) {
    const logDir = this.configService.get('LOG_FILE_PATH', './logs');
    const logLevel = this.configService.get('LOG_LEVEL', 'info');
    const environment = this.configService.get('NODE_ENV', 'development');

    // Logger configuration
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: { service: 'bero-travel' },
      transports: [
        // Console output
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              let metaStr = '';
              if (Object.keys(meta).length > 0) {
                metaStr = ` ${JSON.stringify(meta)}`;
              }
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            }),
          ),
        }),

        // File logging - all logs
        new DailyRotateFile({
          filename: `${logDir}/application-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          maxSize: this.configService.get('LOG_MAX_SIZE', '10m'),
          maxFiles: this.configService.get('LOG_MAX_FILES', '14'),
          format: winston.format.json(),
        }),

        // File logging - error only
        new DailyRotateFile({
          filename: `${logDir}/errors-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: this.configService.get('LOG_MAX_SIZE', '10m'),
          maxFiles: this.configService.get('LOG_MAX_FILES', '14'),
          format: winston.format.json(),
        }),
      ],
    });

    // Add sentry in production
    if (environment === 'production') {
      const sentryDsn = this.configService.get('SENTRY_DSN');
      if (sentryDsn) {
        // Sentry integration would go here
        // This is a placeholder for actual Sentry setup
      }
    }
  }

  log(message: string, context?: string, meta?: any) {
    this.logger.info(message, { context, ...meta });
  }

  error(message: string, trace?: string, context?: string, meta?: any) {
    this.logger.error(message, { trace, context, ...meta });
  }

  warn(message: string, context?: string, meta?: any) {
    this.logger.warn(message, { context, ...meta });
  }

  debug(message: string, context?: string, meta?: any) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(message, { context, ...meta });
    }
  }

  verbose(message: string, context?: string, meta?: any) {
    this.logger.silly(message, { context, ...meta });
  }

  // Log HTTP requests (can be used in middleware)
  logHttpRequest(method: string, url: string, statusCode: number, duration: number) {
    this.logger.info('HTTP Request', {
      method,
      url,
      statusCode,
      duration,
      timestamp: new Date(),
    });
  }

  // Log database queries
  logQuery(query: string, duration: number, params?: any[]) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug('Database Query', {
        query,
        duration,
        params,
      });
    }
  }

  // Log payment transactions
  logPaymentTransaction(
    paymentId: string,
    status: string,
    gateway: string,
    amount: number,
    meta?: any,
  ) {
    this.logger.info('Payment Transaction', {
      paymentId,
      status,
      gateway,
      amount,
      ...meta,
    });
  }

  // Log user actions (for audit trail)
  logUserAction(userId: string, action: string, resource: string, meta?: any) {
    this.logger.info('User Action', {
      userId,
      action,
      resource,
      ...meta,
      timestamp: new Date(),
    });
  }

  // Log errors with context
  logError(error: Error | string, context?: string, meta?: any) {
    const message = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;

    this.logger.error(message, {
      context,
      stack,
      ...meta,
    });
  }
}
