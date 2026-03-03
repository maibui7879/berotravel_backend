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

  /**
   * Tính toán lại toàn bộ lịch trình cho chuyến đi
   */
  async recalculateEntireJourney(journey: Journey): Promise<void> {
    const allPlaceIds = journey.days
      .flatMap(d => d.stops.map(s => s.place_id))
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    const places = await this.placeRepo.find({ where: { _id: { $in: allPlaceIds } } as any });
    const placeMap = new Map(places.map(p => [p._id.toString(), p]));

    // Sắp xếp các ngày theo thứ tự thời gian
    journey.days.sort((a, b) => a.day_number - b.day_number);
    let lastStopOfPrevDay: JourneyStop | null = null;

    for (const day of journey.days) {
      // Reset warnings mỗi lần tính lại để đảm bảo dữ liệu mới nhất
      day.warnings = []; 
      
      this.recalculateSingleDay(day, placeMap, lastStopOfPrevDay);
      
      // Luôn cập nhật last stop để nối tiếp hành trình sang ngày hôm sau
      if (day.stops.length > 0) {
        lastStopOfPrevDay = day.stops[day.stops.length - 1];
      }
    }
  }

  /**
   * Tính toán lịch trình cho một ngày cụ thể dựa trên điểm kết thúc của ngày trước đó
   */
  private recalculateSingleDay(
    day: JourneyDay,
    placeMap: Map<string, any>,
    prevDayLastStop: JourneyStop | null,
  ) {
    if (day.stops.length === 0) return;

    for (let i = 0; i < day.stops.length; i++) {
      const currentStop = day.stops[i];

      // Điểm trước đó có thể là điểm cuối ngày hôm qua hoặc điểm liền trước trong cùng ngày
      const prevStop = i === 0 ? prevDayLastStop : day.stops[i - 1];
      const isFirstStopOfDay = i === 0;

      const userOriginalEndTime = currentStop.end_time;

      // 1. Tính toán Transit và giờ bắt đầu (Start Time)
      this.calculateTransitAndStartTime(currentStop, prevStop, placeMap, isFirstStopOfDay);

      // 2. Kiểm tra các ràng buộc thời gian (Hỗ trợ xuyên đêm)
      if (userOriginalEndTime) {
          this.validateTimeConstraints(day, currentStop, userOriginalEndTime);
      }

      // 3. Tính toán giờ kết thúc (End Time)
      this.calculateEndTime(currentStop, userOriginalEndTime);

      currentStop.sequence = i + 1;
    }

    this.analyzeScheduleDensity(day);
  }

  /**
   * Tính toán thông tin di chuyển và nội suy giờ đến dựa trên điểm trước đó
   */
  private calculateTransitAndStartTime(
    currentStop: JourneyStop,
    prevStop: JourneyStop | null,
    placeMap: Map<string, any>,
    isFirstStopOfDay: boolean,
  ) {
    const originalStartTime = currentStop.start_time;

    // Nếu là điểm đầu tiên của cả hành trình (không có điểm trước đó)
    if (!prevStop) {
      currentStop.transit_from_previous = null;
      if (!currentStop.start_time) currentStop.start_time = '08:00';
      return;
    }

    const prevPlace = placeMap.get(prevStop.place_id);
    const currentPlace = placeMap.get(currentStop.place_id);
    
    let travelMinutes = 30; 
    let distanceVal = 0;
    let mode = currentStop.transit_from_previous?.mode || 'DRIVING';

    // Ưu tiên thông tin di chuyển thủ công nếu có
    if (currentStop.is_manual_transit && currentStop.transit_from_previous?.duration_minutes) {
      travelMinutes = currentStop.transit_from_previous.duration_minutes;
      distanceVal = currentStop.transit_from_previous.distance_km || 0;
      mode = currentStop.transit_from_previous.mode;
    }
    // Tính toán tự động dựa trên tọa độ
    else if (prevPlace?.location?.coordinates && currentPlace?.location?.coordinates) {
      distanceVal = JourneyUtils.getHaversineDistance(
        prevPlace.location.coordinates[1], prevPlace.location.coordinates[0],
        currentPlace.location.coordinates[1], currentPlace.location.coordinates[0],
      );

      const config = (JourneyUtils.TRANSIT_CONFIG as any)[mode] || JourneyUtils.TRANSIT_CONFIG.DRIVING;
      travelMinutes = Math.ceil((distanceVal / config.speed) * 60) + config.buffer;
    }

    currentStop.transit_from_previous = {
      mode: mode as any,
      distance_km: distanceVal,
      duration_minutes: travelMinutes,
      from_place_id: prevStop.place_id,
    };

    // --- LOGIC XỬ LÝ THỜI GIAN NỐI TIẾP ---
    let baseTime: string;

    if (isFirstStopOfDay) {
      // Nếu ngày trước kết thúc xuyên đêm (ví dụ 02:00 sáng) hoặc kết thúc rất muộn
      const prevEndMins = JourneyUtils.timeToMinutes(prevStop.end_time);
      const prevStartMins = JourneyUtils.timeToMinutes(prevStop.start_time);

      // Nếu giờ kết thúc < giờ bắt đầu (xuyên đêm) hoặc kết thúc sau nửa đêm
      if (prevEndMins < prevStartMins || prevEndMins < 5 * 60) {
        baseTime = prevStop.end_time;
      } else {
        baseTime = '08:00';
      }
    } else {
      baseTime = prevStop.end_time;
    }

    const arrivalTime = JourneyUtils.addMinutesToTime(baseTime, travelMinutes);
    const diffMinutes = JourneyUtils.compareTime(originalStartTime, arrivalTime);

    // Nếu user không nhập giờ, hoặc giờ nhập không hợp lý (đến quá sớm hoặc lệch quá 30p) -> Auto sửa
    if (!originalStartTime || diffMinutes < 0 || diffMinutes > 30) {
      currentStop.start_time = arrivalTime;
    } else {
      currentStop.start_time = originalStartTime;
    }
  }

  /**
   * Kiểm tra tính hợp lệ của thời gian (Đã loại bỏ chặn lỗi Start > End để hỗ trợ xuyên đêm)
   */
  private validateTimeConstraints(day: JourneyDay, currentStop: JourneyStop, userEndTime: string) {
      // [FIX]: Xử lý giá trị null của start_time trước khi truyền vào hàm tính toán
      const startTimeStr = currentStop.start_time || '00:00';
      const duration = JourneyUtils.getDurationMinutes(startTimeStr, userEndTime);

      // Cảnh báo thời gian quá ngắn
      if (duration < 30) {
          day.warnings?.push(
              `Cảnh báo: Thời gian tại địa điểm thứ ${currentStop.sequence} quá ngắn (${duration} phút).`
          );
      }

      // Cảnh báo nếu ở một chỗ quá lâu (có thể do nhập nhầm)
      if (duration > 12 * 60) {
          day.warnings?.push(
              `Lưu ý: Thời gian tại địa điểm thứ ${currentStop.sequence} kéo dài hơn 12 tiếng.`
          );
      }
  }

  /**
   * Tính toán End Time dựa trên giờ bắt đầu và lựa chọn của người dùng
   */
  private calculateEndTime(currentStop: JourneyStop, userOriginalEndTime: string | null) {
    if (userOriginalEndTime) {
      currentStop.end_time = userOriginalEndTime;
    } else {
      currentStop.end_time = JourneyUtils.addMinutesToTime(currentStop.start_time, 60);
    }
  }

  /**
   * Phân tích mật độ và giờ giấc để đưa ra cảnh báo về sức khỏe lịch trình
   */
  private analyzeScheduleDensity(day: JourneyDay) {
    const stops = day.stops;
    if (stops.length === 0) return;

    const lastStop = stops[stops.length - 1];
    const firstStop = stops[0];

    // Cảnh báo giờ giấc dựa trên tổng số phút trong ngày
    const lastEndMins = JourneyUtils.timeToMinutes(lastStop.end_time);
    const firstStartMins = JourneyUtils.timeToMinutes(firstStop.start_time);

    if (lastEndMins > 22 * 60 && lastEndMins < 24 * 60) {
       day.warnings?.push('Lịch trình kết thúc khá muộn (sau 22:00).');
    }
    
    // Cảnh báo nếu bắt đầu quá sớm (trừ trường hợp xuyên đêm từ hôm qua)
    if (firstStartMins < 5 * 60 && firstStartMins > 0) {
       day.warnings?.push('Lịch trình bắt đầu rất sớm (trước 05:00).');
    }

    if (stops.length > 8) {
       day.warnings?.push(`Lịch trình dày đặc (${stops.length} địa điểm).`);
    }
  }
}