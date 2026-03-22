import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminController } from './admin.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { Payment, Payout } from '../payments/entities/payment.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Auth } from '../auth/entities/auth.entity';
import { User } from '../users/entities/user.entity';
import { MerchantRequest } from '../users/entities/merchant-request.entity';
import { Place } from '../places/entities/place.entity';
import { ForumPost, ForumComment } from '../forum/entities/forum.entity';
import { ForumReport } from '../forum/entities/forum-report.entity';

import { NotificationsModule } from '../notification/notification.module';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment, 
      Payout, 
      Booking, 
      Auth, 
      User, 
      MerchantRequest, 
      Place, 
      ForumPost, 
      ForumComment, 
      ForumReport
    ]),
    NotificationsModule,
    PlacesModule, 
  ],
  controllers: [AdminController],
  providers: [AdminDashboardService],
})
export class AdminModule {}