import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { Review } from './entities/review.entity';
import { Place } from '../places/entities/place.entity'; // Đảm bảo đúng đường dẫn
import { Booking } from '../bookings/entities/booking.entity'; // Đảm bảo đúng đường dẫn

@Module({
  imports: [
    // Đăng ký các Entity để Repository có thể được Inject vào Service
    TypeOrmModule.forFeature([
      Review, 
      Place, 
      Booking
    ]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService], 
})
export class ReviewsModule {}