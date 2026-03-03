import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Winston Logger Service
 * Cung cấp giải pháp logging tập trung với khả năng xoay vòng file và định dạng tùy chỉnh
 */
@Injectable()
export class LoggerService {
  private logger: winston.Logger;

  constructor(private configService: ConfigService) {
    const logDir = this.configService.get('LOG_FILE_PATH', './logs');
    const logLevel = this.configService.get('LOG_LEVEL', 'info');
    const environment = this.configService.get('NODE_ENV', 'development');

    // 1. Cấu hình định dạng log cơ bản
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    // 2. Khởi tạo danh sách các kênh xuất log (transports)
    const transports: winston.transport[] = [
      // Kênh Console - Luôn hoạt động để Vercel thu thập log
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
    ];

    // 3. CHỈ thêm các kênh ghi file nếu KHÔNG phải môi trường Production (Vercel)
    // Điều này giúp tránh lỗi "EROFS: read-only file system" trên Vercel
    if (environment !== 'production') {
      transports.push(
        // Ghi toàn bộ log
        new DailyRotateFile({
          filename: `${logDir}/application-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          maxSize: this.configService.get('LOG_MAX_SIZE', '10m'),
          maxFiles: this.configService.get('LOG_MAX_FILES', '14'),
          format: winston.format.json(),
        }),
        // Chỉ ghi log lỗi
        new DailyRotateFile({
          filename: `${logDir}/errors-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: this.configService.get('LOG_MAX_SIZE', '10m'),
          maxFiles: this.configService.get('LOG_MAX_FILES', '14'),
          format: winston.format.json(),
        }),
      );
    }

    // 4. Khởi tạo instance của Winston
    this.logger = winston.createLogger({
      level: logLevel,
      format: logFormat,
      defaultMeta: { service: 'bero-travel' },
      transports: transports,
    });
  }

  // Các phương thức logging tiêu chuẩn
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

  // Ghi log yêu cầu HTTP
  logHttpRequest(method: string, url: string, statusCode: number, duration: number) {
    this.logger.info('HTTP Request', {
      method,
      url,
      statusCode,
      duration,
      timestamp: new Date(),
    });
  }

  // Ghi log truy vấn cơ sở dữ liệu
  logQuery(query: string, duration: number, params?: any[]) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug('Database Query', {
        query,
        duration,
        params,
      });
    }
  }

  // Ghi log giao dịch thanh toán
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

  // Ghi log hành động người dùng (audit trail)
  logUserAction(userId: string, action: string, resource: string, meta?: any) {
    this.logger.info('User Action', {
      userId,
      action,
      resource,
      ...meta,
      timestamp: new Date(),
    });
  }

  // Tiện ích ghi log lỗi có context
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