import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminController } from './admin.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { Payment, Payout } from '../payments/entities/payment.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Auth } from '../auth/entities/auth.entity';
import { User } from '../users/entities/user.entity';
import { MerchantRequest } from '../users/entities/merchant-request.entity';

import { NotificationsModule } from '../notification/notification.module';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Payout, Booking, Auth, User, MerchantRequest]),
    NotificationsModule,
    PlacesModule, // Import PlacesModule to get PlacesService with all its dependencies resolved
  ],
  controllers: [AdminController],
  providers: [AdminDashboardService],
})
export class AdminModule {}