import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envValidationSchema } from './configs/env.validation';
import { ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { PlacesModule } from './modules/places/places.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ChatModule } from './modules/chat/chat.module';
import { JourneysModule } from './modules/journey/journey.module';
import { GroupsModule } from './modules/group/group.module';
import { NotificationsModule } from './modules/notification/notification.module';

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
    UsersModule,
    AuthModule,
    PlacesModule,
    InventoryModule,
    BookingsModule,
    ReviewsModule,
    ChatModule,
    JourneysModule,
    GroupsModule,
    NotificationsModule,
  ],
})
export class AppModule {}