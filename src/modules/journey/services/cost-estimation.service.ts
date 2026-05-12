import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { Journey, JourneyDay } from '../entities/journey.entity';
import { InventoryUnit } from '../../bookings/entities/inventory-unit.entity';
import { Availability as AvailabilityEntity } from '../../bookings/entities/availability.entity';
import { Place } from '../../places/entities/place.entity';

export const COST_RATES = {
  transportation: {
    DRIVING: 3000,          
    PUBLIC_TRANSPORT: 1000, 
    WALKING: 0,
  },
  dining: {
    RESTAURANT: { breakfast: 100000, lunch: 150000, dinner: 250000 },
    CAFE: { breakfast: 50000, lunch: 70000, dinner: 80000 },
    STREET_FOOD: { breakfast: 30000, lunch: 40000, dinner: 50000 },
  },
  activities: {
    SIGHTSEEING: 150000,
    HOTEL: 0, 
    RESTAURANT: 0,
    HIKING: 200000,
    TOUR: 500000,
    ADVENTURE: 800000,
  },
  accommodation: {
    default: 500000, 
  },
};

export interface AccommodationCost {
  unit_id: string;
  unit_name: string;
  check_in: Date;
  check_out: Date;
  nights: number;
  nightly_rate: number;
  subtotal: number;
  is_estimated?: boolean; 
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
}

export interface TransportationCost {
  type: 'between-days' | 'within-day';
  from_place: string;
  to_place: string;
  distance_km: number;
  mode: string;
  estimated_cost: number;
  is_shared: boolean;
}

export interface CostSummary {
  total_accommodation: number;
  total_dining: number;
  total_activities: number;
  total_transportation: number;
  subtotal: number; 
  contingency_buffer: number; 
  grand_total: number; 
  cost_per_person: number;
  currency: string;
}

export interface CostEstimationBreakdown {
  accommodation: AccommodationCost[];
  dining: DiningCost[];
  activities: ActivityCost[];
  transportation: TransportationCost[];
  summary: CostSummary;
}

@Injectable()
export class CostEstimationService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @InjectRepository(InventoryUnit) private readonly unitRepo: MongoRepository<InventoryUnit>,
    @InjectRepository(AvailabilityEntity) private readonly availRepo: MongoRepository<AvailabilityEntity>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
  ) {}

  async estimateJourneyBudget(
    journeyId: string,
    includeAccommodation: boolean = true,
    memberCount?: number,
  ): Promise<CostEstimationBreakdown> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    const actualMemberCount = memberCount || journey.members?.length || 1;

    const allPlaceIds = journey.days
      .flatMap(d => d.stops.map(s => s.place_id))
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const places = await this.placeRepo.find({ where: { _id: { $in: allPlaceIds } } as any });
    const placeMap = new Map(places.map(p => [p._id.toString(), p]));

    const accommodationCosts: AccommodationCost[] = [];
    const diningCosts: DiningCost[] = [];
    const activityCosts: ActivityCost[] = [];
    const transportationCosts: TransportationCost[] = [];

    const hotelStops: { place_id: string; date: Date; is_prepaid: boolean; explicit_checkout_date?: Date }[] = [];

    for (let i = 0; i < journey.days.length; i++) {
      const day = journey.days[i];
      const dayNum = i + 1;

      const dayDining = this.calculateDiningCost(day, dayNum, placeMap);
      if (dayDining.subtotal > 0) diningCosts.push(dayDining);

      for (let j = 0; j < day.stops.length; j++) {
        const stop = day.stops[j];
        const place = placeMap.get(stop.place_id);

        if (!place) continue;

        const isAccommodation = ['HOTEL', 'HOMESTAY'].includes(place.category);
        const isDiningPlace = ['RESTAURANT', 'CAFE', 'STREET_FOOD'].includes(place.category);

        if (includeAccommodation && isAccommodation && !stop.is_manual_cost && !stop.is_prepaid) {
            const lastHotel = hotelStops.length > 0 ? hotelStops[hotelStops.length - 1] : null;

          if (lastHotel && lastHotel.place_id === stop.place_id) {
            lastHotel.explicit_checkout_date = day.date;
          } else {
            hotelStops.push({
              place_id: stop.place_id,
              date: day.date,
              is_prepaid: stop.is_prepaid || false
            });
          }
        }

        if (!stop.is_prepaid) {
          if (!(isDiningPlace || isAccommodation) || stop.is_manual_cost) {
            let finalCost = 0;

            if (stop.is_manual_cost) {
               finalCost = stop.estimated_cost;
               
            } 
            else if (place.estimated_cost_vnd && place.estimated_cost_vnd > 0) {
        finalCost = place.estimated_cost_vnd;
      }
            else {
              
               finalCost = this.getDefaultActivityCost(place.category);
            }

            if (finalCost > 0) {
              activityCosts.push({
                day_number: dayNum,
                sequence: j + 1,
                place_name: place.name,
                place_category: place.category,
                estimated_cost: finalCost,
              });
            }
          }
        }

        if (stop.transit_from_previous) {
          const mode = stop.transit_from_previous.mode;
          const dist = stop.transit_from_previous.distance_km;
          const rate = (COST_RATES.transportation as any)[mode] || 0;
          
          const isShared = mode === 'DRIVING'; 
          const baseCost = dist * rate;
          const finalCost = isShared ? baseCost : baseCost * actualMemberCount;

          transportationCosts.push({
            type: 'within-day',
            from_place: 'Điểm trước',
            to_place: place.name,
            distance_km: dist,
            mode: mode,
            estimated_cost: finalCost,
            is_shared: isShared
          });
        }
      }
    }

    for (let k = 0; k < hotelStops.length; k++) {
        const currentHotel = hotelStops[k];

        if (currentHotel.is_prepaid) continue;

        const checkIn = new Date(currentHotel.date);
        checkIn.setHours(0, 0, 0, 0);

        let checkOut = currentHotel.explicit_checkout_date 
                       ? new Date(currentHotel.explicit_checkout_date) 
                       : new Date(journey.end_date);
        checkOut.setHours(0, 0, 0, 0);

        if (!currentHotel.explicit_checkout_date && k + 1 < hotelStops.length) {
            const nextHotelDate = new Date(hotelStops[k + 1].date);
            nextHotelDate.setHours(0, 0, 0, 0);
            checkOut = nextHotelDate;
        }

        if (checkOut.getTime() <= checkIn.getTime()) {
            checkOut = new Date(checkIn);
            checkOut.setDate(checkOut.getDate() + 1);
        }

        const accCost = await this.calculateAccommodationCost(currentHotel.place_id, checkIn, checkOut);
        accommodationCosts.push(accCost);
    }

    const summary = this.calculateSummary(
      accommodationCosts,
      diningCosts,
      activityCosts,
      transportationCosts,
      actualMemberCount
    );

    return {
      accommodation: accommodationCosts,
      dining: diningCosts,
      activities: activityCosts,
      transportation: transportationCosts,
      summary
    };
  }

  private async calculateAccommodationCost(
    placeId: string,
    checkIn: Date,
    checkOut: Date,
  ): Promise<AccommodationCost> {
    const unit = await this.unitRepo.findOne({ where: { place_id: placeId } });

    const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    if (!unit) {
      const defaultRate = COST_RATES.accommodation.default;
      return {
        unit_id: 'default',
        unit_name: 'Giá ước tính hệ thống',
        check_in: checkIn,
        check_out: checkOut,
        nights,
        nightly_rate: defaultRate,
        subtotal: defaultRate * nights,
        is_estimated: true,
      };
    }

    const avails = await this.availRepo.find({
      where: { unit_id: unit._id.toString(), date: { $gte: checkIn, $lt: checkOut } }
    });

    let avgPrice = unit.base_price || COST_RATES.accommodation.default;
    if (avails.length > 0) {
      const totalOverride = avails.reduce((sum, a) => sum + (a.price_override || unit.base_price), 0);
      avgPrice = totalOverride / avails.length;
    }

    return {
      unit_id: unit._id.toString(),
      unit_name: unit.name,
      check_in: checkIn,
      check_out: checkOut,
      nights,
      nightly_rate: Math.round(avgPrice),
      subtotal: Math.round(avgPrice * nights),
      is_estimated: false,
    };
  }

  private calculateDiningCost(day: JourneyDay, dayNumber: number, placeMap: Map<string, Place>): DiningCost {
    const cost: DiningCost = { day_number: dayNumber, subtotal: 0 };
    
    day.stops.forEach(stop => {
      const place = placeMap.get(stop.place_id);
      
      if (place && ['RESTAURANT', 'CAFE', 'STREET_FOOD'].includes(place.category)) {
        let estimate = 0;
        
        if (stop.is_manual_cost) {
            estimate = stop.estimated_cost;
        } else {
            const hour = parseInt((stop.start_time || '12:00').split(':')[0]);
            const cat = place.category as keyof typeof COST_RATES.dining;
            
            let mealType: 'breakfast' | 'lunch' | 'dinner' = 'lunch';
            if (hour < 11) mealType = 'breakfast';
            else if (hour >= 17) mealType = 'dinner';

            let baseCost = COST_RATES.dining[cat]?.[mealType] || 100000;

            const priceLevel = place.priceLevel || 1;
            const multiplier = this.getPriceLevelMultiplier(priceLevel);
            estimate = place.estimated_cost_vnd ? COST_RATES.dining[cat]?.[mealType] : Math.round(baseCost * multiplier);
        }

        const hour = parseInt((stop.start_time || '12:00').split(':')[0]);
        if (hour < 11) {
            cost.breakfast = { place: place.name, estimated_cost: estimate };
        } else if (hour >= 17) {
            cost.dinner = { place: place.name, estimated_cost: estimate };
        } else {
            cost.lunch = { place: place.name, estimated_cost: estimate };
        }

        cost.subtotal += estimate;
      }
    });

    return cost;
  }

  private calculateSummary(
    acc: AccommodationCost[],
    din: DiningCost[],
    act: ActivityCost[],
    trans: TransportationCost[],
    members: number
  ): CostSummary {
    const totalAcc = acc.reduce((s, i) => s + i.subtotal, 0);
    const baseDining = din.reduce((s, i) => s + i.subtotal, 0);
    const totalDining = baseDining * members;
    const baseAct = act.reduce((s, i) => s + i.estimated_cost, 0);
    const totalAct = baseAct * members;
    const totalTrans = trans.reduce((s, i) => s + i.estimated_cost, 0);

    const subtotal = totalAcc + totalDining + totalAct + totalTrans;

    const contingencyBuffer = Math.round(subtotal * 0.1);
    const grandTotal = subtotal + contingencyBuffer;

    return {
      total_accommodation: totalAcc,
      total_dining: totalDining,
      total_activities: totalAct,
      total_transportation: totalTrans,
      subtotal: subtotal,
      contingency_buffer: contingencyBuffer,
      grand_total: grandTotal,
      cost_per_person: members > 0 ? Math.round(grandTotal / members) : 0,
      currency: 'VND'
    };
  }

  private getPriceLevelMultiplier(priceLevel: number): number {
    const multipliers: { [key: number]: number } = {
      1: 1.0,    // Budget
      2: 1.2,    // Mid-range
      3: 1.5,    // Upscale
      4: 2.0,    // Luxury
    };
    return multipliers[priceLevel] || 1.0;
  }

  private getDefaultActivityCost(cat: string): number {
    return (COST_RATES.activities as any)[cat] || 100000;
  }
}