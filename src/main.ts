import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AtGuard } from './common/guards/at.guard';

// Import thêm các thư viện cho Serverless
import { Handler, Context, Callback } from 'aws-lambda';
import serverlessExpress from '@vendia/serverless-express';

let cachedServer: Handler;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const reflector = new Reflector();
  
  // 1. Cấu hình bảo mật và Middlewares
  app.useGlobalGuards(new AtGuard(reflector));
  
  // Lưu ý: Cấu hình Helmet để không chặn Swagger UI từ CDN trên Vercel
  app.use(helmet({
    contentSecurityPolicy: false, 
  }));
  
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();
  app.setGlobalPrefix('api/v1');

  // 2. Cấu hình Swagger
  const config = new DocumentBuilder()
    .setTitle('BeroTravel API')
    .setDescription('Hệ thống quản lý du lịch thông minh 2025')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  
  // Tinh chỉnh Swagger để load được CSS/JS trên môi trường Serverless (dùng CDN)
  SwaggerModule.setup('api/docs', app, document, {
    customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js',
    ],
  });

  // 3. Global Setup
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformInterceptor());

  // 4. Xử lý môi trường chạy
  if (process.env.NODE_ENV === 'production') {
    await app.init();
    const expressApp = app.getHttpAdapter().getInstance();
    return serverlessExpress({ app: expressApp });
  }

  // Chạy local
  await app.listen(3000);
  console.log(`🚀 Local API Docs: http://localhost:3000/api/docs`);
}

// Export handler cho Vercel
export const handler: Handler = async (event: any, context: Context, callback: Callback) => {
  if (!cachedServer) {
    cachedServer = await bootstrap();
  }
  return cachedServer(event, context, callback);
};

// Khởi chạy bootstrap nếu không phải môi trường production (Vercel)
if (process.env.NODE_ENV !== 'production') {
  bootstrap();
}