import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

// Entities & DTOs
import { Journey, JourneyDay, JourneyStop, TransitInfo, CostType } from '../entities/journey.entity';
import { Place } from '../../places/entities/place.entity'; // [IMPORTANT] Cần Place Entity để validate
import { CreateJourneyDto } from '../dto/create-journey.dto';
import { UpdateJourneyDto } from '../dto/update-journey.dto';
import { AddStopDto } from '../dto/add-stop.dto';
import { MoveStopDto } from '../dto/move-stop.dto';
import { Role } from 'src/common/constants';

// Sub-Services
import { GroupsService } from '../../group/group.service';
import { NotificationsService } from '../../notification/notification.service';
import { UsersService } from '../../users/users.service';
import { JourneyAccessService } from '../services/journey-access.service';
import { JourneySchedulerService } from '../services/journey-scheduler.service';
import { JourneyBudgetService } from '../services/journey-budget.service';
import { JourneyUtils } from '../services/journey-utils';
import { NotificationType } from '../../notification/entities/notification.entity';

// [NEW] Import Service Booking
import { BookingsService } from '../../bookings/bookings.service';

interface CurrentUser {
  sub: string;
  role: Role;
}

@Injectable()
export class JourneysService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>, // Inject Place Repo
    
    // Core Logic Services
    private readonly accessService: JourneyAccessService,
    private readonly schedulerService: JourneySchedulerService,
    private readonly budgetService: JourneyBudgetService,

    // External Services
    private readonly groupsService: GroupsService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    
    // [NEW] Inject Booking Service để check phòng
    private readonly bookingsService: BookingsService,
  ) {}

  // =================================================================
  // PHẦN 1: CORE CRUD
  // =================================================================

  async create(dto: CreateJourneyDto, userId: string): Promise<Journey> {
    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);
    if (end < start) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');

    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const days: JourneyDay[] = Array.from({ length: diffDays }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { id: new ObjectId().toString(), day_number: i + 1, date, stops: [] };
    });

    const journey = this.journeyRepo.create({
      ...dto,
      owner_id: userId,
      start_date: start,
      end_date: end,
      days,
      members: [userId],
      total_budget: 0,
      cost_per_person: 0,
      planned_members_count: dto.planned_members_count || 1,
    });

    const savedJourney = await this.journeyRepo.save(journey);
    this.groupsService.create({ name: `Nhóm: ${dto.name}`, journey_id: savedJourney._id.toString() }, userId).catch(console.error);
    return savedJourney;
  }

  async findOne(id: string): Promise<Journey> {
    return this.accessService.getJourneyWithAccess(id, '', 'VIEW');
  }

  async findMyJourneys(userId: string): Promise<Journey[]> {
    return await this.journeyRepo.find({
      where: { $or: [{ owner_id: userId }, { members: { $in: [userId] } }] },
      order: { created_at: -1 } as any,
    });
  }

  async update(id: string, dto: UpdateJourneyDto, userId: string): Promise<Journey> {
    const journey = await this.accessService.getJourneyWithAccess(id, userId, 'EDIT');
    Object.assign(journey, dto);

    // [LOGIC] Nếu thay đổi số người dự kiến -> Tính lại tiền
    if (dto.planned_members_count !== undefined) {
      await this.budgetService.syncSmartBudget(journey);
    }

    await this.journeyRepo.save(journey);
    this.notifyMembers(journey, userId, 'đã cập nhật thông tin chung');
    return journey;
  }

  async remove(id: string, user: CurrentUser) {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!journey) throw new BadRequestException('Not Found');
    if (journey.owner_id !== user.sub && user.role !== Role.ADMIN) throw new BadRequestException('Forbidden');
    
    await this.journeyRepo.delete(new ObjectId(id));
    return { success: true };
  }

  // =================================================================
  // PHẦN 2: COMPLEX LOGIC (ADD STOP)
  // =================================================================

  async addStop(journeyId: string, dto: AddStopDto, userId: string): Promise<Journey> {
    const journey = await this.accessService.getJourneyWithAccess(journeyId, userId, 'EDIT');

    // 1. Validate Place Existence (Fail-Fast)
    if (!ObjectId.isValid(dto.place_id)) throw new BadRequestException('Place ID không hợp lệ');
    const placeExists = await this.placeRepo.findOne({ 
        where: { _id: new ObjectId(dto.place_id) },
        select: ['_id'] as any 
    });
    if (!placeExists) throw new NotFoundException('Địa điểm không tồn tại trong hệ thống');

    const day = journey.days[dto.day_index];
    if (!day) throw new BadRequestException('Ngày không hợp lệ');

    // ==================================================================
    // [LOGIC] CHECK AVAILABILITY (Booking Check)
    // ==================================================================
    const targetDate = new Date(day.date); 
    const dateStr = targetDate.toISOString().split('T')[0]; // Format YYYY-MM-DD

    // Gọi Booking Service
    const availabilityInfo = await this.bookingsService.getPlaceAvailability(dto.place_id, dateStr);

    // Nếu availabilityInfo có dữ liệu -> Place này có quản lý kho (Hotel/Restaurant/Tour)
    if (availabilityInfo && availabilityInfo.length > 0) {
        // Kiểm tra xem có bất kỳ Unit nào còn trống không
        const hasAnySlot = availabilityInfo.some(unit => {
            const dayStatus = unit.availability.find(d => d.date === dateStr);
            return dayStatus && dayStatus.available_count > 0;
        });

        if (!hasAnySlot) {
            throw new BadRequestException(
                `Địa điểm này đã HẾT CHỖ (Full Booking) vào ngày ${dateStr}. Vui lòng chọn ngày khác hoặc địa điểm khác.`
            );
        }
    }
    // ==================================================================

    if (day.stops.length === 0 && !dto.start_time) {
      throw new BadRequestException('Điểm đầu tiên bắt buộc phải có Start Time');
    }

    // Prepare Data
    const finalCost = (dto.is_manual_cost && dto.estimated_cost !== undefined) ? dto.estimated_cost : 0;
    const isManualCost = !!(dto.is_manual_cost && dto.estimated_cost !== undefined);
    
    let defaultCostType = CostType.PER_PERSON;
    if (['DRIVING', 'BOAT'].includes(dto.transit_mode || '')) defaultCostType = CostType.SHARED;

    let finalStartTime = dto.start_time;
    const finalEndTime = dto.end_time || '09:00';
    if (!finalStartTime) {
       if (day.stops.length > 0 && dto.end_time) {
          finalStartTime = JourneyUtils.addMinutesToTime(dto.end_time, -60); 
       } else {
          finalStartTime = '08:00';
       }
    }

    let transitInfo: TransitInfo | null = null;
    let isManualTransit = false;
    if (dto.transit_mode) {
      transitInfo = {
        mode: dto.transit_mode as any,
        duration_minutes: dto.transit_duration_minutes || 0,
        distance_km: dto.transit_distance_km || 0,
        from_place_id: '',
      };
      if (dto.transit_duration_minutes && dto.transit_duration_minutes > 0) isManualTransit = true;
    }

    // Create Entity
    const newStop: JourneyStop = {
      _id: new ObjectId().toString(),
      place_id: dto.place_id,
      start_time: finalStartTime,
      end_time: finalEndTime,
      note: dto.note,
      estimated_cost: finalCost,
      sequence: day.stops.length + 1,
      transit_from_previous: transitInfo,
      is_manual_cost: isManualCost,
      cost_type: dto.cost_type || defaultCostType,
      is_manual_transit: isManualTransit,
    };

    day.stops.push(newStop);

    // Call Sub-Services (Logic tách rời)
    await this.schedulerService.recalculateEntireJourney(journey);
    await this.budgetService.syncSmartBudget(journey);

    await this.journeyRepo.save(journey);
    this.notifyMembers(journey, userId, 'đã thêm địa điểm mới', dto.day_index + 1);
    return journey;
  }

  async moveStop(userId: string, dto: MoveStopDto): Promise<Journey> {
    const journey = await this.accessService.getJourneyWithAccess(dto.journey_id, userId, 'EDIT');
    const fromDay = journey.days.find(d => d.day_number === dto.from_day_number);
    const toDay = journey.days.find(d => d.day_number === dto.to_day_number);

    if (!fromDay || !toDay) throw new BadRequestException('Ngày không hợp lệ');

    const [movedStop] = fromDay.stops.splice(dto.old_index, 1);
    if (!movedStop) throw new BadRequestException('Stop không tồn tại');

    toDay.stops.splice(dto.new_index, 0, movedStop);

    await this.schedulerService.recalculateEntireJourney(journey);
    await this.budgetService.syncSmartBudget(journey);

    await this.journeyRepo.save(journey);
    this.notifyMembers(journey, userId, 'đã thay đổi thứ tự lịch trình');
    return journey;
  }

  async removeStop(journeyId: string, dayNumber: number, stopId: string, userId: string) {
    const journey = await this.accessService.getJourneyWithAccess(journeyId, userId, 'EDIT');
    const day = journey.days.find(d => d.day_number === dayNumber);
    
    if (day) {
      day.stops = day.stops.filter(s => s._id !== stopId);
      await this.schedulerService.recalculateEntireJourney(journey);
      await this.budgetService.syncSmartBudget(journey);
      await this.journeyRepo.save(journey);
      this.notifyMembers(journey, userId, 'đã xóa một địa điểm', dayNumber);
    }
    return { success: true };
  }

  // --- NOTIFICATION HELPER ---
  private async notifyMembers(journey: Journey, actorId: string, actionText: string, dayNumber?: number) {
    try {
      let actorName = 'Thành viên nhóm';
      const actor = await this.usersService.findOne(actorId).catch(() => null);
      if (actor) actorName = actor.fullName;
      
      let message = `${actorName} ${actionText} trong hành trình "${journey.name}"`;
      if (dayNumber) message += ` (Ngày ${dayNumber})`;
      
      const recipients = journey.members.filter(m => m !== actorId);
      await Promise.all(recipients.map(recipientId =>
        this.notificationsService.createAndSend({
          recipient_id: recipientId,
          sender_id: actorId,
          type: NotificationType.JOURNEY_UPDATE,
          title: 'Cập nhật lịch trình',
          message: message,
          metadata: { journey_id: journey._id.toString() },
        }),
      ));
    } catch (e) { console.error(e); }
  }
}