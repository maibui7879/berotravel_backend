import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { Booking } from './entities/booking.entity';
import { InventoryUnit } from './entities/inventory-unit.entity';
import { Availability } from './entities/availability.entity';
import { Place } from '../places/entities/place.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, InventoryUnit, Availability, Place])],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}