import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';

import { Place } from '../../places/entities/place.entity';
import { UserTravelProfile } from '../../users/entities/user-travel-profile.entity';
import { AutoItineraryDto, AutoItineraryResponseDto } from '../dto/recommendation.dto';
import { RecommendationEngineService } from './recommendation-engine.service';

// IMPORT BẢNG GIÁ DÙNG CHUNG TỪ JOURNEY MODULE
import { COST_RATES } from '../../journey/services/cost-estimation.service';

/**
 * Auto Itinerary Generator
 * * Tự động tạo itinerary dựa trên:
 * 1. Số ngày du lịch
 * 2. Ngân sách tổng (Đã fix logic đồng bộ bảng giá)
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

    // 2. Lấy recommended places từ Travel DNA (Đã được lọc APPROVED bên kia)
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
    const budgetPerDay = input.budget ? Math.floor(input.budget / input.days) : 999999999;
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

        // [FIX LOGIC NGÂN SÁCH] - Lấy giá chuẩn xác từ COST_RATES
        const cat = Array.isArray(place.category) ? place.category[0] : place.category;
        const actualEstimatedCost = this.estimatePlaceCost(cat as string, place.estimated_cost || 0, stopNum);

        // Tính cả chi phí di chuyển giả định (10km mỗi chặng)
        const estimatedTravelDist = 10; 
        const travelCost = estimatedTravelDist * COST_RATES.transportation.DRIVING; 

        // Rào ngân sách
        if (dayBudget + actualEstimatedCost + travelCost > budgetPerDay) {
          continue;
        }

        const duration = this.getPlaceDuration(cat as string);
        const suggestedTime = this.calculateTimeSlot(dayNum, stopNum);

        dayStops.push({
          place_id: place._id,
          name: place.name,
          category: place.category,
          estimated_duration: duration,
          estimated_cost: actualEstimatedCost, // ĐÃ ĐỒNG BỘ VỚI BẢNG GIÁ VND
          suggested_time: suggestedTime,
        });

        dayBudget += actualEstimatedCost;
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
    
    // [FIX BẢO MẬT DỮ LIỆU] - Chỉ lấy địa điểm đã được APPROVED
    const topPlaces = await this.placeRepo.find({
      where: { status: 'APPROVED' } as any,
      take: input.days * 4,
    });

    const itinerary: AutoItineraryResponseDto = {
      days: [],
      total_budget: 0,
      estimated_distance: 0,
    };

    const stopsPerDay = this.STOPS_PER_DAY[input.pace || 'moderate'] || 3;

    for (let dayNum = 1; dayNum <= input.days; dayNum++) {
      const dayStops: any[] = [];
      let dayBudget = 0;
      
      const placesForDay = topPlaces.slice((dayNum - 1) * stopsPerDay, dayNum * stopsPerDay);

      for (let idx = 0; idx < placesForDay.length; idx++) {
        const place = placesForDay[idx];
        const cat = Array.isArray(place.category) ? place.category[0] : place.category;
        
        // [FIX LOGIC NGÂN SÁCH]
        const actualEstimatedCost = this.estimatePlaceCost(cat as string, place.priceLevel || 0, idx);

        dayStops.push({
          place_id: place._id.toString(),
          name: place.name,
          category: Array.isArray(place.category) ? place.category : [place.category],
          estimated_duration: this.getPlaceDuration(cat as string),
          estimated_cost: actualEstimatedCost,
          suggested_time: this.calculateTimeSlot(dayNum, idx),
        });
        
        dayBudget += actualEstimatedCost;
      }

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
   * HELPER: TÍNH GIÁ ĐỒNG BỘ VỚI BẢNG COST_RATES TỪ JOURNEY
   */
  private estimatePlaceCost(category: string, priceLevel: number, stopIndex: number): number {
    if (!category) return 100000;
    const cat = category.toUpperCase();

    // 1. Nếu là địa điểm ăn uống (chia theo bữa sáng/trưa/tối)
    if (['RESTAURANT', 'CAFE', 'STREET_FOOD'].includes(cat)) {
      let mealType: 'breakfast' | 'lunch' | 'dinner' = 'lunch';
      if (stopIndex === 0) mealType = 'breakfast';
      else if (stopIndex >= 2) mealType = 'dinner';

      const diningCat = COST_RATES.dining[cat as keyof typeof COST_RATES.dining];
      return diningCat ? diningCat[mealType] : 100000;
    }

    // 2. Nếu là hoạt động vui chơi/tham quan
    const defaultActivityCost = (COST_RATES.activities as any)[cat];
    if (defaultActivityCost !== undefined) {
      return defaultActivityCost;
    }

    // 3. Fallback: Nội suy từ mức giá của Google
    return priceLevel > 0 ? priceLevel * 100000 : 100000;
  }

  /**
   * Get duration cho mỗi loại địa điểm
   */
  private getPlaceDuration(category: string): number {
    if (!category) return this.PLACE_DURATIONS.OTHER;
    const normalized = category.toUpperCase();
    return this.PLACE_DURATIONS[normalized as keyof typeof this.PLACE_DURATIONS] || this.PLACE_DURATIONS.OTHER;
  }

  /**
   * Tính suggested time: 8am, 11am, 2pm, 5pm
   */
  private calculateTimeSlot(dayNum: number, stopIndex: number): string {
    const times = ['08:00', '11:00', '14:00', '17:00'];
    return times[stopIndex % times.length];
  }
}