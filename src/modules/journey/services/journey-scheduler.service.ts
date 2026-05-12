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
      day.warnings = []; 
      
      this.recalculateSingleDay(day, placeMap, lastStopOfPrevDay);

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

      const userOriginalEndTime = currentStop.end_time;

      this.calculateTransitAndStartTime(currentStop, prevStop, placeMap, isFirstStopOfDay);

      if (userOriginalEndTime) {
          this.validateTimeConstraints(day, currentStop, userOriginalEndTime);
      }
      this.calculateEndTime(currentStop, userOriginalEndTime);

      currentStop.sequence = i + 1;
    }

    this.analyzeScheduleDensity(day);
  }

  private calculateTransitAndStartTime(
    currentStop: JourneyStop,
    prevStop: JourneyStop | null,
    placeMap: Map<string, any>,
    isFirstStopOfDay: boolean,
  ) {
    const originalStartTime = currentStop.start_time;

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

    if (currentStop.is_manual_transit && currentStop.transit_from_previous?.duration_minutes) {
      travelMinutes = currentStop.transit_from_previous.duration_minutes;
      distanceVal = currentStop.transit_from_previous.distance_km || 0;
      mode = currentStop.transit_from_previous.mode;
    }
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

    let baseTime: string;

    if (isFirstStopOfDay) {
      const prevEndMins = JourneyUtils.timeToMinutes(prevStop.end_time);
      const prevStartMins = JourneyUtils.timeToMinutes(prevStop.start_time);

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

    if (!originalStartTime || diffMinutes < 0 || diffMinutes > 30) {
      currentStop.start_time = arrivalTime;
    } else {
      currentStop.start_time = originalStartTime;
    }
  }

  private validateTimeConstraints(day: JourneyDay, currentStop: JourneyStop, userEndTime: string) {
      const startTimeStr = currentStop.start_time || '00:00';
      const duration = JourneyUtils.getDurationMinutes(startTimeStr, userEndTime);

      if (duration < 30) {
          day.warnings?.push(
              `Cảnh báo: Thời gian tại địa điểm thứ ${currentStop.sequence} quá ngắn (${duration} phút).`
          );
      }

      if (duration > 12 * 60) {
          day.warnings?.push(
              `Lưu ý: Thời gian tại địa điểm thứ ${currentStop.sequence} kéo dài hơn 12 tiếng.`
          );
      }
  }

  private calculateEndTime(currentStop: JourneyStop, userOriginalEndTime: string | null) {
    if (userOriginalEndTime) {
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

    const lastEndMins = JourneyUtils.timeToMinutes(lastStop.end_time);
    const firstStartMins = JourneyUtils.timeToMinutes(firstStop.start_time);

    if (lastEndMins > 22 * 60 && lastEndMins < 24 * 60) {
       day.warnings?.push('Lịch trình kết thúc khá muộn (sau 22:00).');
    }

    if (firstStartMins < 5 * 60 && firstStartMins > 0) {
       day.warnings?.push('Lịch trình bắt đầu rất sớm (trước 05:00).');
    }

    if (stops.length > 8) {
       day.warnings?.push(`Lịch trình dày đặc (${stops.length} địa điểm).`);
    }
  }
}