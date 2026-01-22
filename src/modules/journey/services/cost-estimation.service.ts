import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

// Entities
import { Journey, JourneyDay } from '../entities/journey.entity';
import { InventoryUnit } from '../../bookings/entities/inventory-unit.entity';
import { Availability as AvailabilityEntity } from 'src/modules/bookings/entities/availability.entity';
import { Place } from '../../places/entities/place.entity';

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const COST_RATES = {
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

// ============================================================================
// INTERFACES
// ============================================================================

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

    // --- MAIN LOOP ---
    for (let i = 0; i < journey.days.length; i++) {
      const day = journey.days[i];
      const dayNum = i + 1;

      // A. Calculate Dining (Per Day) - Đã cập nhật logic Manual
      const dayDining = this.calculateDiningCost(day, dayNum, placeMap);
      if (dayDining.subtotal > 0) diningCosts.push(dayDining);

      for (let j = 0; j < day.stops.length; j++) {
        const stop = day.stops[j];
        const place = placeMap.get(stop.place_id);

        if (!place) continue;

        // B. Calculate Accommodation (Booking System)
        // Lưu ý: Phần này dựa trên Booking System nên ưu tiên logic hệ thống.
        // Nếu user muốn nhập tay tiền khách sạn, họ nên thêm nó như một Activity với manual cost.
        if (includeAccommodation && (place.category === 'HOTEL')) {
          const accCost = await this.calculateAccommodationCost(stop.place_id, journey.start_date, journey.end_date);
          if (accCost) accommodationCosts.push(accCost);
        }

        // C. Calculate Activities (Vui chơi / Tham quan)
        // Logic: Áp dụng cho những nơi KHÔNG PHẢI là chỗ ăn, chỗ ở (đã tính ở trên)
        // HOẶC nếu người dùng nhập tay (is_manual_cost) thì tính hết
        const isDiningPlace = ['RESTAURANT', 'CAFE', 'STREET_FOOD'].includes(place.category);
        const isAccommodation = ['HOTEL', 'HOMESTAY'].includes(place.category);

        // Nếu là địa điểm vui chơi HOẶC địa điểm ăn uống/ngủ nghỉ nhưng user muốn nhập chi phí phụ (vé vào cửa, tip...)
        if (!isDiningPlace && !isAccommodation || stop.is_manual_cost) {
          
          let finalCost = 0;

          // [LOGIC MỚI] Kiểm tra cờ Manual
          if (stop.is_manual_cost) {
             // 1. Nếu nhập tay -> Dùng giá user
             finalCost = stop.estimated_cost;
          } else {
             // 2. Nếu tự động -> Tra bảng giá mặc định
             finalCost = this.getDefaultActivityCost(place.category);
          }

          // Chỉ thêm vào nếu cost > 0 để tránh rác data
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

        // D. Calculate Transportation (Within Day)
        if (stop.transit_from_previous) {
          const mode = stop.transit_from_previous.mode;
          const dist = stop.transit_from_previous.distance_km;
          const rate = COST_RATES.transportation[mode] || 0;
          
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
      
      // Chỉ tính nếu là nơi ăn uống
      if (place && ['RESTAURANT', 'CAFE', 'STREET_FOOD'].includes(place.category)) {
        
        // [LOGIC MỚI] Check Manual Cost
        let estimate = 0;
        
        if (stop.is_manual_cost) {
            // Trường hợp 1: User nhập tay
            estimate = stop.estimated_cost;
        } else {
            // Trường hợp 2: Tự động tính theo giờ
            const hour = parseInt((stop.start_time || '12:00').split(':')[0]);
            const cat = place.category as keyof typeof COST_RATES.dining;
            
            let mealType: 'breakfast' | 'lunch' | 'dinner' = 'lunch';
            if (hour < 11) mealType = 'breakfast';
            else if (hour >= 17) mealType = 'dinner';

            estimate = COST_RATES.dining[cat]?.[mealType] || 100000;
        }

        // Logic phân loại để hiển thị (chỉ mang tính chất grouping)
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

    // Dining: Nhân số người (Vì mỗi người ăn 1 suất)
    const baseDining = din.reduce((s, i) => s + i.subtotal, 0);
    const totalDining = baseDining * members;

    // Activities: Nhân số người (Vì mỗi người mua 1 vé)
    const baseAct = act.reduce((s, i) => s + i.estimated_cost, 0);
    const totalAct = baseAct * members;

    // Transportation: Không nhân (Vì đã tính toán logic shared/private ở trên)
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