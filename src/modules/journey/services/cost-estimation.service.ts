import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

// Entities
import { Journey, JourneyDay } from '../entities/journey.entity';
import { InventoryUnit } from '../../bookings/entities/inventory-unit.entity';
import { Availability as AvailabilityEntity } from '../../bookings/entities/availability.entity';
import { Place } from '../../places/entities/place.entity';

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================
export const COST_RATES = {
  transportation: {
    DRIVING: 3000,          // VND/km (Xăng xe - Chia sẻ)
    PUBLIC_TRANSPORT: 1000, // VND/km (Vé xe/tàu - Mỗi người 1 vé)
    WALKING: 0,
  },
  dining: {
    RESTAURANT: { breakfast: 100000, lunch: 150000, dinner: 250000 },
    CAFE: { breakfast: 50000, lunch: 70000, dinner: 80000 },
    STREET_FOOD: { breakfast: 30000, lunch: 40000, dinner: 50000 },
  },
  activities: {
    SIGHTSEEING: 150000,
    HOTEL: 0, // Chỉ tính tiền nếu book phòng
    RESTAURANT: 0,
    HIKING: 200000,
    TOUR: 500000,
    ADVENTURE: 800000,
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

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

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

    // --- 1. OPTIMIZATION: BULK FETCH PLACES ---
    const allPlaceIds = journey.days
      .flatMap(d => d.stops.map(s => s.place_id))
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const places = await this.placeRepo.find({ where: { _id: { $in: allPlaceIds } } as any });
    const placeMap = new Map(places.map(p => [p._id.toString(), p]));

    // --- INIT LISTS ---
    const accommodationCosts: AccommodationCost[] = [];
    const diningCosts: DiningCost[] = [];
    const activityCosts: ActivityCost[] = [];
    const transportationCosts: TransportationCost[] = [];

    // Mảng gom các khách sạn để tính toán số đêm cho chuẩn
    const hotelStops: { place_id: string; date: Date; is_prepaid: boolean; explicit_checkout_date?: Date }[] = [];

    // --- MAIN LOOP ---
    for (let i = 0; i < journey.days.length; i++) {
      const day = journey.days[i];
      const dayNum = i + 1;

      // A. Calculate Dining (Per Day)
      const dayDining = this.calculateDiningCost(day, dayNum, placeMap);
      if (dayDining.subtotal > 0) diningCosts.push(dayDining);

      for (let j = 0; j < day.stops.length; j++) {
        const stop = day.stops[j];
        const place = placeMap.get(stop.place_id);

        if (!place) continue;

        const isAccommodation = ['HOTEL', 'HOMESTAY'].includes(place.category);
        const isDiningPlace = ['RESTAURANT', 'CAFE', 'STREET_FOOD'].includes(place.category);

        // B. Gom danh sách Khách sạn để xử lý sau (chống duplicate check-in)
        // [ĐÃ VÁ LỖI]: Không đẩy vào mảng tiền đêm nếu là thuê day-use tự nhập giá
        if (includeAccommodation && isAccommodation && !stop.is_manual_cost && !stop.is_prepaid) {
            const lastHotel = hotelStops.length > 0 ? hotelStops[hotelStops.length - 1] : null;

          // Nếu Stop này trùng với Khách sạn ngay trước đó (User add lại vào ngày hôm sau để checkout)
          if (lastHotel && lastHotel.place_id === stop.place_id) {
            // Không tạo lần Check-in mới, mà lấy ngày này làm mốc Check-out cho lần trước
            lastHotel.explicit_checkout_date = day.date;
          } else {
            // Khách sạn mới hoàn toàn -> Tạo lần Check-in mới
            hotelStops.push({
              place_id: stop.place_id,
              date: day.date,
              is_prepaid: stop.is_prepaid || false
            });
          }
        }

        // C. Calculate Activities
        if (!stop.is_prepaid) {
          // Tính phí hoạt động NẾU không phải chỗ ngủ/chỗ ăn, HOẶC nếu user cố tình tự nhập giá (Day-use / Vé dịch vụ)
          if (!(isDiningPlace || isAccommodation) || stop.is_manual_cost) {
            let finalCost = 0;

            if (stop.is_manual_cost) {
               finalCost = stop.estimated_cost;
            } else {
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

        // D. Calculate Transportation (Luôn tính phí di chuyển, dù điểm đó có Prepaid hay không)
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

    // --- XỬ LÝ SỐ ĐÊM KHÁCH SẠN (HOTEL NIGHTS) ---
    for (let k = 0; k < hotelStops.length; k++) {
        const currentHotel = hotelStops[k];
        
        // Nếu đã thanh toán trước (Bao phòng) thì bỏ qua không tính vào bill chung
        if (currentHotel.is_prepaid) continue;

        const checkIn = new Date(currentHotel.date);
        checkIn.setHours(0, 0, 0, 0);

        // Ưu tiên 1: Lấy ngày Check-out do người dùng tự ghim (nếu có)
        // Ưu tiên 2: Lấy ngày kết thúc hành trình
        let checkOut = currentHotel.explicit_checkout_date 
                       ? new Date(currentHotel.explicit_checkout_date) 
                       : new Date(journey.end_date);
        checkOut.setHours(0, 0, 0, 0);

        // Ưu tiên 3: Nếu không có ngày tự ghim, mà có khách sạn mới tiếp theo thì bị đè ngày check-out
        if (!currentHotel.explicit_checkout_date && k + 1 < hotelStops.length) {
            const nextHotelDate = new Date(hotelStops[k + 1].date);
            nextHotelDate.setHours(0, 0, 0, 0);
            checkOut = nextHotelDate;
        }

        // Đảm bảo thuê tối thiểu 1 đêm (nếu user chèn 2 khách sạn trong cùng 1 ngày do nhầm lẫn)
        if (checkOut.getTime() <= checkIn.getTime()) {
            checkOut = new Date(checkIn);
            checkOut.setDate(checkOut.getDate() + 1);
        }

        const accCost = await this.calculateAccommodationCost(currentHotel.place_id, checkIn, checkOut);
        if (accCost) accommodationCosts.push(accCost);
    }

    // --- SUMMARY CALCULATION ---
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

  // =================================================================
  // HELPERS 
  // =================================================================
  private async calculateAccommodationCost(
    placeId: string,
    checkIn: Date,
    checkOut: Date,
  ): Promise<AccommodationCost | null> {
    const unit = await this.unitRepo.findOne({ where: { place_id: placeId } });
    if (!unit) return null;

    const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
    
    const avails = await this.availRepo.find({
      where: { unit_id: unit._id.toString(), date: { $gte: checkIn, $lt: checkOut } }
    });

    let avgPrice = unit.base_price;
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

            estimate = COST_RATES.dining[cat]?.[mealType] || 100000;
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
    const grandTotal = totalAcc + totalDining + totalAct + totalTrans;

    return {
      total_accommodation: totalAcc,
      total_dining: totalDining,
      total_activities: totalAct,
      total_transportation: totalTrans,
      grand_total: grandTotal,
      cost_per_person: members > 0 ? Math.round(grandTotal / members) : 0,
      currency: 'VND'
    };
  }

  private getDefaultActivityCost(cat: string): number {
    return (COST_RATES.activities as any)[cat] || 100000;
  }
}