import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './services/users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { UserTravelProfile } from './entities/user-travel-profile.entity';
import { Place } from '../places/entities/place.entity';
import { UserProfileService } from './services/user-profile.service';
import { UserProfileCronService } from './services/user-profile-cron.service';

// 1. THÊM IMPORT MerchantRequest VÀ NotificationModule
import { MerchantRequest } from './entities/merchant-request.entity';
import { NotificationsModule } from '../notification/notification.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // 2. THÊM MerchantRequest VÀO ĐÂY
    TypeOrmModule.forFeature([User, UserTravelProfile, Place, MerchantRequest]), 
    // 3. THÊM NotificationModule VÀO ĐÂY
    NotificationsModule
  ],
  controllers: [UsersController],
  providers: [UsersService, UserProfileService, UserProfileCronService],
  exports: [UsersService, UserProfileService],
})
export class UsersModule {}