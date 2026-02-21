import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';

import { Place } from '../../places/entities/place.entity';
import { UserTravelProfile } from '../../users/entities/user-travel-profile.entity';
import { AutoItineraryDto, AutoItineraryResponseDto } from '../dto/recommendation.dto';
import { RecommendationEngineService } from './recommendation-engine.service';

/**
 * Auto Itinerary Generator
 * 
 * Tự động tạo itinerary dựa trên:
 * 1. Số ngày du lịch
 * 2. Ngân sách tổng
 * 3. Travel style (budget/comfort/luxury)
 * 4. Pace (relaxed/moderate/fast)
 * 5. User Travel DNA (sở thích)
 */
@Injectable()
export class AutoItineraryGeneratorService {
  private readonly logger = new Logger(AutoItineraryGeneratorService.name);

  // Cấu hình thời gian ở mỗi loại địa điểm (minutes)
  private readonly PLACE_DURATIONS = {
    MUSEUM: 120,
    BEACH: 180,
    MOUNTAIN: 240,
    TEMPLE: 90,
    RESTAURANT: 60,
    SHOPPING: 120,
    PARK: 90,
    OTHER: 60,
  };

  // Cấu hình số lượng stops theo pace
  private readonly STOPS_PER_DAY = {
    relaxed: 2,
    moderate: 3,
    fast: 4,
  };

  // Travel time giữa các stops (minutes, bình quân)
  private readonly INTER_STOP_TRAVEL_TIME = 45;

  constructor(
    @InjectRepository(Place)
    private readonly placeRepo: MongoRepository<Place>,
    @InjectRepository(UserTravelProfile)
    private readonly profileRepo: MongoRepository<UserTravelProfile>,
    private readonly recommendationEngine: RecommendationEngineService,
  ) {}

  /**
   * Tạo itinerary tự động
   * @param userId 
   * @param input 
   * @returns 
   */
  async generateAutoItinerary(
    userId: string,
    input: AutoItineraryDto,
  ): Promise<AutoItineraryResponseDto> {
    this.logger.log(`Generating itinerary for user ${userId}: ${input.days} days`);

    // 1. Validate inputs
    if (input.days < 1 || input.days > 30) {
      throw new Error('Days must be between 1 and 30');
    }

    // 2. Lấy recommended places từ Travel DNA
    const recommendedPlaces = await this.recommendationEngine.getRecommendedPlaces(
      userId,
      {
        limit: input.days * 5, // ~5 places per day candidates
      },
    );

    if (recommendedPlaces.length === 0) {
      this.logger.warn('No recommended places, using popular places');
      return this.generateDefaultItinerary(input);
    }

    // 3. Tính budget per day
    const budgetPerDay = input.budget ? Math.floor(input.budget / input.days) : 999999;
    const stopsPerDay = this.STOPS_PER_DAY[input.pace || 'moderate'] || 3;

    // 4. Build itinerary
    const itinerary: AutoItineraryResponseDto = {
      days: [],
      total_budget: 0,
      estimated_distance: 0,
    };

    let placeIndex = 0;
    const placesUsed = new Set<string>();

    for (let dayNum = 1; dayNum <= input.days; dayNum++) {
      const dayStops: any[] = [];
      let dayBudget = 0;
      let dayTravelTime = 0;

      for (let stopNum = 0; stopNum < stopsPerDay; stopNum++) {
        if (placeIndex >= recommendedPlaces.length) {
          // Recycle places nếu không đủ
          placeIndex = 0;
          placesUsed.clear();
        }

        let place = recommendedPlaces[placeIndex];

        // Skip places đã dùng (prefer diversity)
        let attempts = 0;
        while (placesUsed.has(place._id) && attempts < 5) {
          placeIndex = (placeIndex + 1) % recommendedPlaces.length;
          place = recommendedPlaces[placeIndex];
          attempts++;
        }

        placesUsed.add(place._id);
        placeIndex = (placeIndex + 1) % recommendedPlaces.length;

        // Skip nếu vượt quá budget
        if (dayBudget + (place.estimated_cost || 0) > budgetPerDay) {
          continue;
        }

        const duration = this.getPlaceDuration(place.category[0]);
        const suggestedTime = this.calculateTimeSlot(dayNum, stopNum);

        dayStops.push({
          place_id: place._id,
          name: place.name,
          category: place.category,
          estimated_duration: duration,
          estimated_cost: place.estimated_cost || 0,
          suggested_time: suggestedTime,
        });

        dayBudget += place.estimated_cost || 0;
        dayTravelTime += this.INTER_STOP_TRAVEL_TIME;
      }

      itinerary.days.push({
        day_number: dayNum,
        stops: dayStops,
        total_cost: dayBudget,
        travel_time: dayTravelTime,
      });

      itinerary.total_budget += dayBudget;
    }

    return itinerary;
  }

  /**
   * Default itinerary nếu không có profile
   */
  private async generateDefaultItinerary(
    input: AutoItineraryDto,
  ): Promise<AutoItineraryResponseDto> {
    const topPlaces = await this.placeRepo.find({
      take: input.days * 4,
    });

    const itinerary: AutoItineraryResponseDto = {
      days: [],
      total_budget: 0,
      estimated_distance: 0,
    };

    const stopsPerDay = this.STOPS_PER_DAY[input.pace || 'moderate'] || 3;

    for (let dayNum = 1; dayNum <= input.days; dayNum++) {
      const dayStops = topPlaces
        .slice((dayNum - 1) * stopsPerDay, dayNum * stopsPerDay)
        .map((place, idx) => ({
          place_id: place._id.toString(),
          name: place.name,
          category: Array.isArray(place.category) ? place.category : [place.category],
          estimated_duration: 90,
          estimated_cost: place.estimated_cost || 500,
          suggested_time: this.calculateTimeSlot(dayNum, idx),
        }));

      const dayBudget = dayStops.reduce((sum, s) => sum + (s.estimated_cost || 0), 0);

      itinerary.days.push({
        day_number: dayNum,
        stops: dayStops,
        total_cost: dayBudget,
        travel_time: (stopsPerDay - 1) * this.INTER_STOP_TRAVEL_TIME,
      });

      itinerary.total_budget += dayBudget;
    }

    return itinerary;
  }

  /**
   * Get duration cho mỗi loại địa điểm
   */
  private getPlaceDuration(category: string): number {
    const normalized = category.toUpperCase();
    return this.PLACE_DURATIONS[normalized] || this.PLACE_DURATIONS.OTHER;
  }

  /**
   * Tính suggested time: 8am, 11am, 2pm, 5pm
   */
  private calculateTimeSlot(dayNum: number, stopIndex: number): string {
    const times = ['08:00', '11:00', '14:00', '17:00'];
    return times[stopIndex % times.length];
  }
}
