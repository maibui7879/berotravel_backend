import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Place } from '../../places/entities/place.entity';
import { Journey, JourneyDay, JourneyStop } from '../entities/journey.entity';
import { JourneyUtils } from './journey-utils';

@Injectable()
export class JourneySchedulerService {
  constructor(
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
  ) {}

  /**
   * Tính toán lại toàn bộ lịch trình (Core Logic)
   * Hàm này sẽ thay đổi trực tiếp object Journey (pass by reference)
   */
  async recalculateEntireJourney(journey: Journey): Promise<void> {
    // 1. Bulk Fetch Places để tối ưu DB query
    const allPlaceIds = journey.days
      .flatMap(d => d.stops.map(s => s.place_id))
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const places = await this.placeRepo.find({ where: { _id: { $in: allPlaceIds } } as any });
    const placeMap = new Map(places.map(p => [p._id.toString(), p]));

    // 2. Sắp xếp ngày
    journey.days.sort((a, b) => a.day_number - b.day_number);

    // 3. Vòng lặp chính qua các ngày
    let lastStopOfPrevDay: JourneyStop | null = null;

    for (const day of journey.days) {
      this.recalculateSingleDay(day, placeMap, lastStopOfPrevDay);
      // Cập nhật điểm cuối cùng để làm đầu vào cho ngày hôm sau
      if (day.stops.length > 0) {
        lastStopOfPrevDay = day.stops[day.stops.length - 1];
      }
    }
  }

  private recalculateSingleDay(
    day: JourneyDay,
    placeMap: Map<string, any>,
    prevDayLastStop: JourneyStop | null,
  ) {
    if (day.stops.length === 0) return;

    for (let i = 0; i < day.stops.length; i++) {
      const currentStop = day.stops[i];
      const prevStop = i === 0 ? prevDayLastStop : day.stops[i - 1];
      const isFirstStopOfDay = i === 0;

      // Tính toán Transit & Start Time
      this.calculateTransitAndStartTime(currentStop, prevStop, placeMap, isFirstStopOfDay);

      // Tính toán End Time
      this.calculateEndTime(currentStop);

      currentStop.sequence = i + 1;
    }
  }

  private calculateTransitAndStartTime(
    currentStop: JourneyStop,
    prevStop: JourneyStop | null,
    placeMap: Map<string, any>,
    isFirstStopOfDay: boolean,
  ) {
    const originalStartTime = currentStop.start_time;

    // A. Nếu không có điểm trước đó (Ngày 1, Stop 1)
    if (!prevStop) {
      currentStop.transit_from_previous = null;
      if (!currentStop.start_time) currentStop.start_time = '08:00';
      return;
    }

    // B. Tính toán Transit
    const prevPlace = placeMap.get(prevStop.place_id);
    const currentPlace = placeMap.get(currentStop.place_id);
    
    let travelMinutes = 30; // Default fallback
    let distanceVal = 0;
    let mode = 'DRIVING';

    // B1. Ưu tiên Manual Input
    if (currentStop.is_manual_transit && currentStop.transit_from_previous?.duration_minutes) {
      travelMinutes = currentStop.transit_from_previous.duration_minutes;
      distanceVal = currentStop.transit_from_previous.distance_km || 0;
      mode = currentStop.transit_from_previous.mode;
    }
    // B2. Auto Calculate
    else if (prevPlace?.location?.coordinates && currentPlace?.location?.coordinates) {
      distanceVal = JourneyUtils.getHaversineDistance(
        prevPlace.location.coordinates[1], prevPlace.location.coordinates[0],
        currentPlace.location.coordinates[1], currentPlace.location.coordinates[0],
      );

      mode = currentStop.transit_from_previous?.mode || 'DRIVING';
      const config = (JourneyUtils.TRANSIT_CONFIG as any)[mode] || JourneyUtils.TRANSIT_CONFIG.DRIVING;
      travelMinutes = Math.ceil((distanceVal / config.speed) * 60) + config.buffer;
    }

    currentStop.transit_from_previous = {
      mode: mode as any,
      distance_km: distanceVal,
      duration_minutes: travelMinutes,
      from_place_id: prevStop.place_id,
    };

    // C. Tính Start Time
    let baseTime = isFirstStopOfDay ? '08:00' : prevStop.end_time;
    const arrivalTime = JourneyUtils.addMinutesToTime(baseTime, travelMinutes);

    const diffMinutes = JourneyUtils.compareTime(originalStartTime, arrivalTime);

    // Logic GAP:
    // 1. Chưa nhập -> Lấy arrival
    // 2. Nhập sớm hơn arrival (Vô lý) -> Lấy arrival
    // 3. Nhập muộn hơn arrival quá 30p (Gap lớn) -> Lấy arrival (kéo lại cho gọn)
    // 4. Nhập muộn hơn <= 30p -> Giữ nguyên (User muốn nghỉ ngơi)
    if (!originalStartTime || diffMinutes < 0 || diffMinutes > 30) {
      currentStop.start_time = arrivalTime;
    } else {
      currentStop.start_time = originalStartTime;
    }
  }

  private calculateEndTime(currentStop: JourneyStop) {
    const originalEndTime = currentStop.end_time;
    // Nếu EndTime cũ vẫn hợp lý (lớn hơn StartTime mới) -> Giữ nguyên
    if (originalEndTime && JourneyUtils.compareTime(currentStop.start_time, originalEndTime) < 0) {
      currentStop.end_time = originalEndTime;
    } else {
      // Nếu bị lố -> +60p mặc định
      currentStop.end_time = JourneyUtils.addMinutesToTime(currentStop.start_time, 60);
    }
  }
}