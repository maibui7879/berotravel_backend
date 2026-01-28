import { Injectable, BadRequestException } from '@nestjs/common';
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

  async recalculateEntireJourney(journey: Journey): Promise<void> {
    const allPlaceIds = journey.days
      .flatMap(d => d.stops.map(s => s.place_id))
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const places = await this.placeRepo.find({ where: { _id: { $in: allPlaceIds } } as any });
    const placeMap = new Map(places.map(p => [p._id.toString(), p]));

    journey.days.sort((a, b) => a.day_number - b.day_number);
    let lastStopOfPrevDay: JourneyStop | null = null;

    for (const day of journey.days) {
      // Reset warnings mỗi lần tính lại
      day.warnings = []; 
      
      this.recalculateSingleDay(day, placeMap, lastStopOfPrevDay);
      
      // Update last stop để dùng cho ngày tiếp theo
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
      // Nếu là stop đầu tiên của ngày -> So sánh với stop cuối ngày trước
      // Nếu không -> So sánh với stop liền trước trong cùng ngày
      const prevStop = i === 0 ? prevDayLastStop : day.stops[i - 1];
      const isFirstStopOfDay = i === 0;

      // Lưu EndTime gốc user gửi lên để validate
      const userOriginalEndTime = currentStop.end_time;

      // 1. Tính Start Time
      this.calculateTransitAndStartTime(currentStop, prevStop, placeMap, isFirstStopOfDay);

      // 2. Validate Logic
      if (userOriginalEndTime) {
          this.validateTimeConstraints(day, currentStop, userOriginalEndTime);
      }

      // 3. Tính End Time
      this.calculateEndTime(currentStop, userOriginalEndTime);

      currentStop.sequence = i + 1;
    }

    // 4. Phân tích mật độ
    this.analyzeScheduleDensity(day);
  }

  private calculateTransitAndStartTime(
    currentStop: JourneyStop,
    prevStop: JourneyStop | null,
    placeMap: Map<string, any>,
    isFirstStopOfDay: boolean,
  ) {
    const originalStartTime = currentStop.start_time;

    // Nếu không có điểm trước (Ngày 1, Stop 1), không tính transit
    if (!prevStop) {
      currentStop.transit_from_previous = null;
      if (!currentStop.start_time) currentStop.start_time = '08:00';
      return;
    }

    const prevPlace = placeMap.get(prevStop.place_id);
    const currentPlace = placeMap.get(currentStop.place_id);
    
    let travelMinutes = 30; 
    let distanceVal = 0;
    let mode = 'DRIVING';

    // Ưu tiên Manual Transit (nếu user nhập tay)
    if (currentStop.is_manual_transit && currentStop.transit_from_previous?.duration_minutes) {
      travelMinutes = currentStop.transit_from_previous.duration_minutes;
      distanceVal = currentStop.transit_from_previous.distance_km || 0;
      mode = currentStop.transit_from_previous.mode;
    }
    // Tính tự động bằng Haversine
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

    let baseTime;
    if (isFirstStopOfDay) {
 
         baseTime = '08:00';
         if (!originalStartTime) currentStop.start_time = '08:00';
         return; 
    } else {
         baseTime = prevStop.end_time;
         
         const arrivalTime = JourneyUtils.addMinutesToTime(baseTime, travelMinutes);
         const diffMinutes = JourneyUtils.compareTime(originalStartTime, arrivalTime);
    
         // Nếu user không nhập giờ, hoặc giờ nhập không hợp lý (đến quá sớm hoặc quá muộn) -> Auto sửa
         if (!originalStartTime || diffMinutes < 0 || diffMinutes > 30) {
           currentStop.start_time = arrivalTime;
         } else {
           currentStop.start_time = originalStartTime;
         }
    }
  }

  private validateTimeConstraints(day: JourneyDay, currentStop: JourneyStop, userEndTime: string) {
      const startMins = this.timeToMinutes(currentStop.start_time);
      const endMins = this.timeToMinutes(userEndTime);

      // CASE 1: Start > End -> CHẶN
      if (startMins > endMins) {
          throw new BadRequestException(
              `Không thể di chuyển kịp! Bạn đến nơi lúc ${currentStop.start_time} nhưng lại muốn kết thúc lúc ${userEndTime}. Vui lòng chọn địa điểm gần hơn hoặc kéo dài thời gian.`
          );
      }

      // CASE 2: Duration < 30p -> WARNING
      const duration = endMins - startMins;
      if (duration < 30) {
          day.warnings?.push(
              `Cảnh báo: Thời gian tại địa điểm thứ ${currentStop.sequence} quá ngắn (${duration} phút).`
          );
      }
  }

  private calculateEndTime(currentStop: JourneyStop, userOriginalEndTime: string | null) {
    if (userOriginalEndTime && JourneyUtils.compareTime(currentStop.start_time, userOriginalEndTime) < 0) {
      currentStop.end_time = userOriginalEndTime;
    } else {
      currentStop.end_time = JourneyUtils.addMinutesToTime(currentStop.start_time, 60);
    }
  }

  private analyzeScheduleDensity(day: JourneyDay) {
    const stops = day.stops;
    if (stops.length === 0) return;

    const lastStop = stops[stops.length - 1];
    const firstStop = stops[0];

    // Cảnh báo giờ giấc
    if (this.timeToMinutes(lastStop.end_time) > 22 * 60) {
       day.warnings?.push('Lịch trình kết thúc quá muộn (sau 22:00).');
    }
    if (this.timeToMinutes(firstStop.start_time) < 5 * 60) {
       day.warnings?.push('Lịch trình bắt đầu quá sớm (trước 05:00).');
    }

    // Cảnh báo số lượng
    if (stops.length > 8) {
       day.warnings?.push(`Lịch trình dày đặc (${stops.length} địa điểm).`);
    }
  }

  private timeToMinutes(time: string | null): number {
      if (!time) return 0;
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
  }
}