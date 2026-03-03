import 'module-alias/register'; // PHẢI NẰM DÒNG 1
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AtGuard } from './common/guards/at.guard';

// Import cho Vercel Serverless
import serverlessExpress from '@vendia/serverless-express';
import { Callback, Context, Handler } from 'aws-lambda';

let cachedServer: Handler;

async function bootstrap(): Promise<Handler> {
  if (!cachedServer) {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    const reflector = new Reflector();
    app.useGlobalGuards(new AtGuard(reflector));
    app.use(helmet({ contentSecurityPolicy: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.enableCors();
    app.setGlobalPrefix('api/v1');

    // Swagger setup (Dùng CDN để tránh lỗi file tĩnh trên Vercel)
    const config = new DocumentBuilder()
      .setTitle('BeroTravel API')
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

    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init(); // Quan trọng cho Serverless

    const expressApp = app.getHttpAdapter().getInstance();
    cachedServer = serverlessExpress({ app: expressApp });
  }
  return cachedServer;
}

// FIX LỖI: Export mặc định cho Vercel
export default async (event: any, context: Context, callback: Callback) => {
  const handler = await bootstrap();
  return handler(event, context, callback);
};