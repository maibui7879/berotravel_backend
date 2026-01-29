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

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([User, UserTravelProfile, Place]) // Đăng ký Entity
  ],
  controllers: [UsersController],
  providers: [UsersService, UserProfileService, UserProfileCronService], // Đăng ký Service
  exports: [UsersService, UserProfileService], // Export để module khác (Favorites, Tracking) dùng
})
export class UsersModule {}