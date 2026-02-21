import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationEngineService } from './services/recommendation-engine.service';
import { AutoItineraryGeneratorService } from './services/auto-itinerary-generator.service';
import { Place } from '../places/entities/place.entity';
import { UserTravelProfile } from '../users/entities/user-travel-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Place, UserTravelProfile]),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationEngineService, AutoItineraryGeneratorService],
  exports: [RecommendationEngineService, AutoItineraryGeneratorService],
})
export class RecommendationsModule {}
