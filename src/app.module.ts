import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envValidationSchema } from './configs/env.validation';
import { ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { PlacesModule } from './modules/places/places.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ChatModule } from './modules/chat/chat.module';
import { JourneysModule } from './modules/journey/journey.module';
import { NotificationsModule } from './modules/notification/notification.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { FriendModule } from './modules/friend/friend.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { EmailModule } from './modules/email/email.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CacheModule } from './common/cache/cache.module';
import { LoggerModule } from './common/logger/logger.module';
import { AdminModule } from './modules/admin/admin.module';
import { HttpLoggerMiddleware } from './common/logger/http-logger.middleware';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mongodb',
        url: configService.get<string>('MONGO_URI'),
        database: configService.get<string>('DB_NAME'),
        synchronize: true,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        logging: true,
      }),
    }),
    CacheModule,
    LoggerModule,
    UsersModule,
    AuthModule,
    PlacesModule,
    BookingsModule,
    ReviewsModule,
    ChatModule,
    JourneysModule,
    NotificationsModule,
    FavoritesModule,
    FriendModule,
    RecommendationsModule,
    EmailModule,
    PaymentsModule,
    AdminModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}