import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { Journey, JourneyDay, JourneyStop, CostType, StopStatus, JourneyVisibility } from '../entities/journey.entity';
import { Place } from '../../places/entities/place.entity';
import { CreateJourneyDto } from '../dto/create-journey.dto';
import { UpdateJourneyDto } from '../dto/update-journey.dto';
import { AddStopDto } from '../dto/add-stop.dto';
import { MoveStopDto } from '../dto/move-stop.dto';
import { CreateJoinRequestDto, ReplyJoinRequestDto, ReplyStatus } from '../dto/social-journey.dto';
import { Role } from 'src/common/constants';

import { GroupsService } from '../../group/group.service';
import { NotificationsService } from '../../notification/notification.service';
import { UsersService } from '../../users/users.service';
import { JourneyAccessService } from './journey-access.service';
import { JourneySchedulerService } from './journey-scheduler.service';
import { JourneyBudgetService } from './journey-budget.service';
import { JourneyUtils } from './journey-utils';
import { NotificationType } from '../../notification/entities/notification.entity';
import { BookingsService } from '../../bookings/bookings.service';

interface CurrentUser {
  sub: string;
  role: Role;
}

@Injectable()
export class JourneysService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
    
    private readonly accessService: JourneyAccessService,
    private readonly schedulerService: JourneySchedulerService,
    private readonly budgetService: JourneyBudgetService,

    @Inject(forwardRef(() => GroupsService))
    private readonly groupsService: GroupsService,

    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly bookingsService: BookingsService,
  ) {}

  // =================================================================
  // CORE CRUD
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
      visibility: JourneyVisibility.PRIVATE
    });
    const savedJourney = await this.journeyRepo.save(journey);

    const group = await this.groupsService.create({ 
        name: `Nhóm: ${dto.name}`, 
        journey_id: savedJourney._id.toString() 
    }, userId);

    savedJourney.group_id = group._id.toString();

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

  async getPublicJourneys(search?: string): Promise<Journey[]> {
    const filter: any = { 
        visibility: JourneyVisibility.PUBLIC 
    };

    if (search) {
        filter.name = { $regex: new RegExp(search, 'i') };
    }

    return await this.journeyRepo.find({
        where: filter,
        order: { created_at: -1 } as any,
        take: 50 
    });
  }

  async update(id: string, dto: UpdateJourneyDto, userId: string): Promise<Journey> {
    const journey = await this.accessService.getJourneyWithAccess(id, userId, 'EDIT');
    Object.assign(journey, dto);

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
    
    for (const day of journey.days) {
        const dateStr = new Date(day.date).toISOString().split('T')[0];
        for (const stop of day.stops) {
            if (stop.status === StopStatus.PENDING) {
                await this.bookingsService.releaseBookingSlot(
                    stop.place_id, 
                    dateStr, 
                    journey.members.length || 1
                );
            }
        }
    }

    await this.journeyRepo.delete(new ObjectId(id));
    return { success: true };
  }
  
  // SOCIAL: PUBLIC JOIN REQUESTS (VIA GROUP)
  async sendJoinRequest(journeyId: string, userId: string, dto: CreateJoinRequestDto) {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');
    
    if (journey.visibility !== JourneyVisibility.PUBLIC) {
        throw new BadRequestException('Hành trình này không công khai');
    }

    if (!journey.group_id) throw new BadRequestException('Hành trình chưa được liên kết nhóm chat');
    if (journey.owner_id === userId) throw new BadRequestException('Bạn là chủ sở hữu');

    await this.groupsService.requestToJoin(journey.group_id, userId);

    this.notifyMembers(journey, journey.owner_id, `muốn tham gia hành trình: "${dto.message || ''}"`, undefined, userId);

    return { success: true, message: 'Đã gửi yêu cầu tham gia' };
  }

  async getPendingRequests(journeyId: string, userId: string) {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');
    if (!journey.group_id) return [];
    
    return await this.groupsService.getPendingRequests(journey.group_id, userId);
  }

  async replyJoinRequest(journeyId: string, requestUserId: string, userId: string, dto: ReplyJoinRequestDto) {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');
    if (!journey.group_id) throw new BadRequestException('Hành trình lỗi: Không có Group ID');

    if (dto.status === ReplyStatus.REJECTED) {
        await this.groupsService.rejectRequest(journey.group_id, { member_id: requestUserId }, userId);
        
        this.notificationsService.createAndSend({
            recipient_id: requestUserId,
            sender_id: userId,
            type: NotificationType.SYSTEM,
            title: 'Yêu cầu tham gia',
            message: `Yêu cầu tham gia "${journey.name}" đã bị từ chối.`,
            metadata: { journey_id: journeyId }
        });
    } else {
        await this.groupsService.approveRequest(journey.group_id, { member_id: requestUserId }, userId);

        this.notificationsService.createAndSend({
            recipient_id: requestUserId,
            sender_id: userId,
            type: NotificationType.SYSTEM,
            title: 'Yêu cầu tham gia',
            message: `Yêu cầu tham gia "${journey.name}" đã được chấp nhận!`,
            metadata: { journey_id: journeyId }
        });
    }

    return { success: true, status: dto.status };
  }

  // COMPLEX LOGIC (STOPS)
  async addStop(journeyId: string, dto: AddStopDto, userId: string): Promise<Journey> {
    const journey = await this.accessService.getJourneyWithAccess(journeyId, userId, 'EDIT');
    
    if (!ObjectId.isValid(dto.place_id)) throw new BadRequestException('Place ID không hợp lệ');
    const placeExists = await this.placeRepo.findOne({ where: { _id: new ObjectId(dto.place_id) }, select: ['_id'] as any });
    if (!placeExists) throw new NotFoundException('Địa điểm không tồn tại');
    
    const day = journey.days[dto.day_index];
    const dateStr = new Date(day.date).toISOString().split('T')[0];
    const availabilityInfo = await this.bookingsService.getPlaceAvailability(dto.place_id, dateStr);
    
    if (availabilityInfo && availabilityInfo.length > 0) {
      const hasSlot = availabilityInfo.some(u => {
        const dayStatus = u.availability.find(d => d.date === dateStr);
        return (dayStatus?.available_count ?? 0) > 0;
      });

      if (!hasSlot) {
        throw new BadRequestException(`Địa điểm đã HẾT CHỖ ngày ${dateStr}`);
      }
    }

    const finalStartTime = dto.start_time || (day.stops.length > 0 && dto.end_time ? JourneyUtils.addMinutesToTime(dto.end_time, -60) : '08:00');
    
    const newStop: JourneyStop = {
      _id: new ObjectId().toString(),
      place_id: dto.place_id,
      start_time: finalStartTime,
      end_time: dto.end_time || '09:00',
      note: dto.note,
      estimated_cost: dto.estimated_cost || 0,
      sequence: day.stops.length + 1,
      cost_type: dto.cost_type || CostType.PER_PERSON, 
      transit_from_previous: null,
      status: StopStatus.PENDING,
    };
    
    day.stops.push(newStop);

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
      const stop = day.stops.find(s => s._id === stopId);
      
      if (stop) {
           if (stop.status === StopStatus.PENDING) {
                const dateStr = new Date(day.date).toISOString().split('T')[0];
                await this.bookingsService.releaseBookingSlot(
                    stop.place_id, 
                    dateStr, 
                    journey.members.length || 1
                );
           }
           
           day.stops = day.stops.filter(s => s._id !== stopId);
           
           await this.schedulerService.recalculateEntireJourney(journey);
           await this.budgetService.syncSmartBudget(journey);
           await this.journeyRepo.save(journey);
           this.notifyMembers(journey, userId, 'đã xóa một địa điểm', dayNumber);
      }
    }
    return { success: true };
  }

  async refreshJourneyBudget(journeyId: string) {
     const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
     if (!journey) return;
     
     await this.budgetService.syncSmartBudget(journey);
     await this.journeyRepo.save(journey);
  }

  private async notifyMembers(journey: Journey, actorId: string, actionText: string, dayNumber?: number, senderId?: string) {
    try {
      let actorName = 'Thành viên nhóm';
      const actor = await this.usersService.findOne(actorId).catch(() => null);
      if (actor) actorName = actor.fullName;
      
      let message = `${actorName} ${actionText} trong hành trình "${journey.name}"`;
      if (dayNumber) message += ` (Ngày ${dayNumber})`;
      
      const recipients = journey.members.filter(m => m !== (senderId || actorId));
      
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