import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Journey, JourneyDay, JourneyStop } from '../entities/journey.entity';
import { InventoryUnit } from '../../bookings/entities/inventory-unit.entity';
import { Availability as AvailabilityEntity } from 'src/modules/bookings/entities/availability.entity';
import { Place } from '../../places/entities/place.entity';

/**
 * ============================================================================
 * COST ESTIMATION ALGORITHM FOR JOURNEY
 * ============================================================================
 * 
 * LUỒNG TÍNH CHI PHÍ TỐI ƯU CHO CHUYẾN ĐI:
 * 
 * 1. ACCOMMODATION COST (Chi phí lưu trú)
 *    - Dựa vào check_in/check_out dates
 *    - Áp dụng dynamic pricing (price_override nếu có)
 *    - Công thức: Sum(days) × (base_price hoặc price_override)
 *
 * 2. DINING COST (Chi phí ăn uống)
 *    - Tính per day × number of restaurants
 *    - Phân loại: breakfast, lunch, dinner
 *    - Tính toán từ Place.priceLevel và estimated_cost
 *
 * 3. ACTIVITY COST (Chi phí hoạt động)
 *    - Entrance fees, guided tours, etc.
 *    - Từ JourneyStop.estimated_cost
 *    - Có thể set manual hoặc auto-calc từ place thông tin
 *
 * 4. TRANSPORTATION COST (Chi phí vận chuyển)
 *    - Tính dựa vào distance × rate per km
 *    - Có 3 loại: car, bus, train
 *    - Công thức: distance_km × costPerKm[mode]
 *
 * 5. GROUP SPLIT (Chia chi phí nhóm)
 *    - Tính per person: total_cost / memberCount
 *    - Có thể custom split % nếu cần
 *
 * ============================================================================
 */

export interface CostEstimationBreakdown {
  accommodation: AccommodationCost[];
  dining: DiningCost[];
  activities: ActivityCost[];
  transportation: TransportationCost[];
  miscellaneous: MiscellaneousCost[];
  groupSplit: GroupSplitCost;
  summary: CostSummary;
}

export interface AccommodationCost {
  unit_id: string;
  unit_name: string;
  check_in: Date;
  check_out: Date;
  nights: number;
  nightly_rate: number;
  subtotal: number;
  notes?: string;
}

export interface DiningCost {
  day_number: number;
  breakfast?: { place: string; estimated_cost: number };
  lunch?: { place: string; estimated_cost: number };
  dinner?: { place: string; estimated_cost: number };
  subtotal: number;
}

export interface ActivityCost {
  day_number: number;
  sequence: number;
  place_name: string;
  place_category: string;
  estimated_cost: number;
  priority: 'must-do' | 'optional' | 'flexible'; // User can set
}

export interface TransportationCost {
  type: 'between-days' | 'within-day' | 'airport-transfer';
  from_place: string;
  to_place: string;
  distance_km: number;
  mode: 'DRIVING' | 'WALKING' | 'PUBLIC_TRANSPORT';
  cost_rate: number; // VND/km
  estimated_cost: number;
}

export interface MiscellaneousCost {
  category: string;
  description: string;
  estimated_cost: number;
}

export interface GroupSplitCost {
  total_cost: number;
  member_count: number;
  cost_per_person: number;
  manual_splits?: Record<string, number>; // user_id -> amount
}

export interface CostSummary {
  total_accommodation: number;
  total_dining: number;
  total_activities: number;
  total_transportation: number;
  total_miscellaneous: number;
  grand_total: number;
  cost_per_person: number;
  currency: string; // 'VND', 'USD', etc.
  confidence_level: 'exact' | 'high' | 'medium' | 'low'; // Dựa vào số estimate vs booked
}

// ============================================================================
// PRICING CONSTANTS
// ============================================================================

const COST_RATES = {
  // Transportation cost per km
  transportation: {
    DRIVING: 3000, // VND/km (petrol + wear & tear)
    PUBLIC_TRANSPORT: 1000, // VND/km (bus, train avg)
    WALKING: 0, // Miễn phí
  },

  // Dining cost estimation by place category (VND per meal)
  dining: {
    RESTAURANT: {
      breakfast: 100000,
      lunch: 150000,
      dinner: 200000,
    },
    CAFE: {
      breakfast: 50000,
      lunch: 80000,
      dinner: 100000,
    },
    STREET_FOOD: {
      breakfast: 30000,
      lunch: 50000,
      dinner: 70000,
    },
  },

  // Default activity costs by category (VND)
  activities: {
    SIGHTSEEING: 150000, // Temple, museum entry
    HOTEL: 0, // No entry cost
    RESTAURANT: 0, // Included in dining
    HIKING: 50000, // Guide + equipment
    TOUR: 300000, // Full day guided tour
    ADVENTURE: 500000, // Extreme activities
  },
};

@Injectable()
export class CostEstimationService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @InjectRepository(InventoryUnit) private readonly unitRepo: MongoRepository<InventoryUnit>,
    @InjectRepository(AvailabilityEntity) private readonly availRepo: MongoRepository<AvailabilityEntity>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
  ) {}

  /**
   * MAIN ALGORITHM: Calculate comprehensive cost for entire journey
   */
  async estimateJourneyBudget(
    journeyId: string,
    includeAccommodation: boolean = true,
    memberCount: number = 1,
  ): Promise<CostEstimationBreakdown> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new Error('Journey not found');

    const accommodationCosts: AccommodationCost[] = [];
    const diningCosts: DiningCost[] = [];
    const activityCosts: ActivityCost[] = [];
    const transportationCosts: TransportationCost[] = [];

    // ========== STEP 1: Calculate Accommodation ==========
    if (includeAccommodation) {
      for (const day of journey.days) {
        for (const stop of day.stops) {
          // Check if this stop is a HOTEL or HOUSE
          const place = await this.placeRepo.findOne({
            where: { _id: new ObjectId(stop.place_id) },
          });

          if (place && (place.category === 'HOTEL' || stop.place_id.includes('accommodation'))) {
            const accommodationCost = await this.calculateAccommodationCost(
              stop.place_id,
              journey.start_date,
              journey.end_date,
            );
            if (accommodationCost) {
              accommodationCosts.push(accommodationCost);
            }
          }
        }
      }
    }

    // ========== STEP 2: Calculate Dining Costs ==========
    for (let i = 0; i < journey.days.length; i++) {
      const day = journey.days[i];
      const diningCost = await this.calculateDiningCost(day, i + 1);
      if (diningCost.subtotal > 0) {
        diningCosts.push(diningCost);
      }
    }

    // ========== STEP 3: Calculate Activity Costs ==========
    for (let i = 0; i < journey.days.length; i++) {
      const day = journey.days[i];
      for (let j = 0; j < day.stops.length; j++) {
        const stop = day.stops[j];
        const place = await this.placeRepo.findOne({
          where: { _id: new ObjectId(stop.place_id) },
        });

        if (place && place.category !== 'HOTEL') {
          const activityCost: ActivityCost = {
            day_number: i + 1,
            sequence: j + 1,
            place_name: place.name,
            place_category: place.category,
            estimated_cost: stop.estimated_cost || this.getDefaultActivityCost(place.category),
            priority: 'flexible',
          };
          activityCosts.push(activityCost);
        }
      }
    }

    // ========== STEP 4: Calculate Transportation Costs ==========
    for (let i = 0; i < journey.days.length; i++) {
      const day = journey.days[i];
      for (let j = 0; j < day.stops.length; j++) {
        const stop = day.stops[j];

        // Within-day transportation (between stops)
        if (stop.transit_from_previous) {
          const transportCost: TransportationCost = {
            type: 'within-day',
            from_place: stop.transit_from_previous.from_place_id,
            to_place: stop.place_id,
            distance_km: stop.transit_from_previous.distance_km,
            mode: stop.transit_from_previous.mode as 'DRIVING' | 'WALKING' | 'PUBLIC_TRANSPORT',
            cost_rate: COST_RATES.transportation[stop.transit_from_previous.mode],
            estimated_cost:
              stop.transit_from_previous.distance_km *
              COST_RATES.transportation[stop.transit_from_previous.mode],
          };
          transportationCosts.push(transportCost);
        }

        // Between-days transportation (to next day's first stop)
        if (i < journey.days.length - 1 && j === day.stops.length - 1) {
          const nextDay = journey.days[i + 1];
          if (nextDay.stops.length > 0) {
            const fromPlace = await this.placeRepo.findOne({
              where: { _id: new ObjectId(stop.place_id) },
            });
            const toPlace = await this.placeRepo.findOne({
              where: { _id: new ObjectId(nextDay.stops[0].place_id) },
            });

            if (fromPlace?.location?.coordinates && toPlace?.location?.coordinates) {
              const distance = this.getHaversineDistance(
                fromPlace.location.coordinates[1],
                fromPlace.location.coordinates[0],
                toPlace.location.coordinates[1],
                toPlace.location.coordinates[0],
              );

              const transportCost: TransportationCost = {
                type: 'between-days',
                from_place: fromPlace.name,
                to_place: toPlace.name,
                distance_km: distance,
                mode: 'DRIVING',
                cost_rate: COST_RATES.transportation.DRIVING,
                estimated_cost: distance * COST_RATES.transportation.DRIVING,
              };
              transportationCosts.push(transportCost);
            }
          }
        }
      }
    }

    // ========== STEP 5: Calculate Summary & Group Split ==========
    const summary = this.calculateSummary(
      accommodationCosts,
      diningCosts,
      activityCosts,
      transportationCosts,
    );

    const groupSplit: GroupSplitCost = {
      total_cost: summary.grand_total,
      member_count: memberCount,
      cost_per_person: Math.round(summary.grand_total / memberCount),
    };

    return {
      accommodation: accommodationCosts,
      dining: diningCosts,
      activities: activityCosts,
      transportation: transportationCosts,
      miscellaneous: [],
      groupSplit,
      summary,
    };
  }

  /**
   * Calculate accommodation cost for specific stay
   */
  private async calculateAccommodationCost(
    placeId: string,
    checkIn: Date,
    checkOut: Date,
  ): Promise<AccommodationCost | null> {
    const units = await this.unitRepo.find({ where: { place_id: placeId } });
    if (!units.length) return null;

    const unit = units[0]; // Assume first unit is the main accommodation

    // Calculate number of nights
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Get pricing from availability (with dynamic pricing)
    const availabilities = await this.availRepo.find({
      where: {
        unit_id: unit._id.toString(),
        date: { $gte: checkIn, $lt: checkOut },
      },
    });

    // Calculate average price per night
    const avgPricePerNight = this.calculateAveragePricePerNight(availabilities, unit.base_price);

    return {
      unit_id: unit._id.toString(),
      unit_name: unit.name,
      check_in: checkIn,
      check_out: checkOut,
      nights,
      nightly_rate: avgPricePerNight,
      subtotal: avgPricePerNight * nights,
      notes: `${nights} nights at ${unit.name}`,
    };
  }

  /**
   * Calculate dining costs for a specific day
   */
  private async calculateDiningCost(day: JourneyDay, dayNumber: number): Promise<DiningCost> {
    const diningCost: DiningCost = {
      day_number: dayNumber,
      subtotal: 0,
    };

    // Find restaurants in this day
    const restaurants = await Promise.all(
      day.stops
        .filter((stop) => stop.place_id) // Has place reference
        .map(async (stop) => {
          const place = await this.placeRepo.findOne({
            where: { _id: new ObjectId(stop.place_id) },
          });
          return place;
        }),
    );

    // Group by meal type (simple heuristic based on time)
    let breakfastFound = false;
    let lunchFound = false;
    let dinnerFound = false;

    for (const stop of day.stops) {
      const place = restaurants.find((p) => p?._id.toString() === stop.place_id);
      if (!place || place.category !== 'RESTAURANT') continue;

      const hour = this.getHourFromTime(stop.start_time);

      if (hour >= 6 && hour < 11 && !breakfastFound) {
        diningCost.breakfast = {
          place: place.name,
          estimated_cost: stop.estimated_cost || COST_RATES.dining.RESTAURANT.breakfast,
        };
        diningCost.subtotal += diningCost.breakfast.estimated_cost;
        breakfastFound = true;
      } else if (hour >= 11 && hour < 17 && !lunchFound) {
        diningCost.lunch = {
          place: place.name,
          estimated_cost: stop.estimated_cost || COST_RATES.dining.RESTAURANT.lunch,
        };
        diningCost.subtotal += diningCost.lunch.estimated_cost;
        lunchFound = true;
      } else if (hour >= 17 && hour <= 23 && !dinnerFound) {
        diningCost.dinner = {
          place: place.name,
          estimated_cost: stop.estimated_cost || COST_RATES.dining.RESTAURANT.dinner,
        };
        diningCost.subtotal += diningCost.dinner.estimated_cost;
        dinnerFound = true;
      }
    }

    return diningCost;
  }

  /**
   * Calculate summary totals
   */
  private calculateSummary(
    accommodationCosts: AccommodationCost[],
    diningCosts: DiningCost[],
    activityCosts: ActivityCost[],
    transportationCosts: TransportationCost[],
  ): CostSummary {
    const totalAccommodation = accommodationCosts.reduce((sum, a) => sum + a.subtotal, 0);
    const totalDining = diningCosts.reduce((sum, d) => sum + d.subtotal, 0);
    const totalActivities = activityCosts.reduce((sum, a) => sum + a.estimated_cost, 0);
    const totalTransportation = transportationCosts.reduce((sum, t) => sum + t.estimated_cost, 0);

    const grandTotal = totalAccommodation + totalDining + totalActivities + totalTransportation;

    return {
      total_accommodation: totalAccommodation,
      total_dining: totalDining,
      total_activities: totalActivities,
      total_transportation: totalTransportation,
      total_miscellaneous: 0,
      grand_total: grandTotal,
      cost_per_person: 0, // Set by caller
      currency: 'VND',
      confidence_level: 'medium', // Most costs are estimated
    };
  }

  /**
   * Helper: Get default activity cost based on category
   */
  private getDefaultActivityCost(category: string): number {
    return COST_RATES.activities[category] || 100000; // Default 100k VND
  }

  /**
   * Helper: Calculate average price per night from availability records
   */
  private calculateAveragePricePerNight(availabilities: Availability[], basePrice: number): number {
    if (availabilities.length === 0) return basePrice;

    const totalPrice = availabilities.reduce((sum, a) => {
      return sum + (a['price_override'] || basePrice);
    }, 0);

    return Math.round(totalPrice / availabilities.length);
  }

  /**
   * Helper: Extract hour from time string (HH:mm format)
   */
  private getHourFromTime(timeStr: string | null | undefined): number {
    if (!timeStr) return 12; // Default to noon
    const [hour] = timeStr.split(':').map(Number);
    return hour;
  }

  /**
   * Helper: Haversine distance calculation
   */
  private getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

export interface Availability {
  _id?: any;
  unit_id: string;
  date: Date;
  available_count: number;
  booked_count: number;
  price_override?: number;
}
