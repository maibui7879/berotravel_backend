import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {TransformInterceptor} from './common/interceptors/transform.interceptor';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AtGuard } from './common/guards/at.guard';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn', 'log', 'debug'], 
});
const reflector = new Reflector();
app.useGlobalGuards(new AtGuard(reflector));
  app.use(helmet());
  app.useGlobalFilters(new AllExceptionsFilter());
  // 1. Cấu hình Swagger
  const config = new DocumentBuilder()
    .setTitle('BeroTravel')
    .setDescription('sybau')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // 2. Global Setup
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformInterceptor());
  app.enableCors();

  await app.listen(3000);
  console.log(`🚀 API Docs: http://localhost:3000/api/docs`);
}

bootstrap();