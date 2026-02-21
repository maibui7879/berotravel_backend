import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminController } from './admin.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { Payment, Payout } from '../payments/entities/payment.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Auth } from '../auth/entities/auth.entity';
import { Place } from '../places/entities/place.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Payout, Booking, Auth, Place]),
  ],
  controllers: [AdminController],
  providers: [AdminDashboardService],
})
export class AdminModule {}
