import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AtGuard } from './common/guards/at.guard';

// Biến lưu trữ instance của Express để tái sử dụng trên Vercel (tránh cold start chậm)
let cachedApp: any;

async function bootstrapApp() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const reflector = new Reflector();

  // 1. Cấu hình bảo mật và Middlewares
  app.useGlobalGuards(new AtGuard(reflector));
  app.use(
    helmet({
      contentSecurityPolicy: false, // Cho phép Swagger tải CSS/JS từ CDN
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();
  app.setGlobalPrefix('api/v1');

  // 2. Cấu hình Swagger (Dùng CDN để Vercel không bị lỗi mất giao diện)
  const config = new DocumentBuilder()
    .setTitle('BeroTravel API')
    .setDescription('Hệ thống quản lý du lịch thông minh 2025')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js',
    ],
  });

  // 3. Global Pipes & Interceptors
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformInterceptor());

  return app;
}

// =====================================================================
// HANDLER CHO VERCEL (SERVERLESS)
// Vercel hỗ trợ nguyên bản (req, res) của Express, không cần wrapper
// =====================================================================
export default async (req: any, res: any) => {
  if (!cachedApp) {
    const app = await bootstrapApp();
    await app.init(); // CHỈ khởi tạo các modules, KHÔNG listen port
    cachedApp = app.getHttpAdapter().getInstance();
  }
  return cachedApp(req, res); // Đẩy request thẳng vào Express
};

// =====================================================================
// HANDLER CHO LOCAL (DEVELOPMENT)
// Chạy server ở port 3000 khi code trên máy tính của bạn
// =====================================================================
if (process.env.NODE_ENV !== 'production') {
  (async () => {
    const app = await bootstrapApp();
    await app.listen(3000);
    console.log(`🚀 Server is running on: http://localhost:3000`);
    console.log(`🚀 Swagger Docs: http://localhost:3000/api/docs`);
  })();
}