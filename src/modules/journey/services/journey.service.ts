import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

import { Journey, JourneyDay, JourneyStop, CostType, StopStatus, JourneyVisibility, JourneyMemberRole, JourneyMember, JourneyJoinRequest, JourneyTag } from '../entities/journey.entity';
import { Place } from '../../places/entities/place.entity';
import { CreateJourneyDto } from '../dto/create-journey.dto';
import { UpdateJourneyDto } from '../dto/update-journey.dto';
import { AddStopDto } from '../dto/add-stop.dto';
import { MoveStopDto } from '../dto/move-stop.dto';
import { CreateJoinRequestDto, ReplyJoinRequestDto, ReplyStatus } from '../dto/social-journey.dto';
import { UpdateStopDto } from '../dto/update-stop.dto';
import { Role, UserActionType } from '../../../common/constants';
import { JourneyStatus } from '../entities/journey.entity';
import { NotificationsService } from '../../notification/notification.service';
import { UsersService } from '../../../modules/users/services/users.service';
import { UserProfileService } from '../../../modules/users/services/user-profile.service'; 
import { JourneyAccessService } from './journey-access.service';
import { JourneyPermissionService } from './journey-permission.service';
import { JourneySchedulerService } from './journey-scheduler.service';
import { JourneyBudgetService } from './journey-budget.service';
import { JourneyUtils } from './journey-utils';
import { NotificationType } from '../../notification/entities/notification.entity';
import { BookingsService } from '../../bookings/bookings.service';
import { ChatMessage, MessageType } from 'src/modules/chat/entities/chat-message.entity';
import { User } from '../../../modules/users/entities/user.entity';

export interface AlbumItem {
  source: 'check-in' | 'chat';
  url: string;
  user_id: string;
  created_at: Date;
  location_note?: string;
}

export interface CurrentUser {
  sub: string;
  role: Role;
}

@Injectable()
export class JourneysService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,
    @InjectRepository(ChatMessage) private readonly chatMessageRepo: MongoRepository<ChatMessage>,

    private readonly accessService: JourneyAccessService,
    private readonly permissionService: JourneyPermissionService,
    private readonly schedulerService: JourneySchedulerService,
    private readonly budgetService: JourneyBudgetService,

    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly bookingsService: BookingsService,
    private readonly userProfileService: UserProfileService,
  ) {}

  private generateInviteCode(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  async create(dto: CreateJourneyDto, userId: string): Promise<Journey> {
    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);
    if (end < start) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    await this.checkScheduleConflict(userId, start, end);
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const days: JourneyDay[] = Array.from({ length: diffDays }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { id: new ObjectId().toString(), day_number: i + 1, date, stops: [] };
    });

    const inviteCode = this.generateInviteCode();
    const hostMember: JourneyMember = {
      user_id: userId,
      role: JourneyMemberRole.HOST,
      joined_at: new Date()
    };

    const journey = this.journeyRepo.create({
      ...dto,
      owner_id: userId,
      start_date: start,
      end_date: end,
      days,
      members: [hostMember],
      invite_code: inviteCode,
      join_requests: [],
      avatar: dto.avatar || null, // Lưu avatar
      tags: dto.tags || [],
      total_budget: 0,
      cost_per_person: 0,
      planned_members_count: dto.planned_members_count || 1,
      visibility: JourneyVisibility.PRIVATE
    });
    const savedJourney = await this.journeyRepo.save(journey);

    return savedJourney;
  }

  async findOne(id: string, userId?: string): Promise<Journey> {
    const journey = await this.accessService.getJourneyWithAccess(id, userId || '', 'VIEW');
    if (journey.owner_id !== userId) {
      delete journey.invite_code;
    }
    return journey;
  }

  async findMyJourneys(userId: string): Promise<Journey[]> {
    return await this.journeyRepo.find({
      where: { $or: [{ owner_id: userId }, { members: { $in: [userId] } }] },
      order: { created_at: -1 } as any,
    });
  }

  async getPublicJourneys(
    search?: string,
    tag?: JourneyTag,
    minPrice?: number,
    maxPrice?: number,
    startDate?: string,
    endDate?: string,
  ): Promise<Journey[]> {
    const filter: any = { 
      visibility: JourneyVisibility.PUBLIC 
    };

    // 1. Lọc theo tên (Search)
    if (search) {
      filter.name = { $regex: new RegExp(search, 'i') };
    }

    // 2. Lọc theo Tag
    if (tag) {
      filter.tags = { $in: [tag] };
    }

    // 3. Lọc theo chi phí ước tính (cost_per_person)
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.cost_per_person = {};
      if (minPrice !== undefined) filter.cost_per_person.$gte = minPrice;
      if (maxPrice !== undefined) filter.cost_per_person.$lte = maxPrice;
    }

    // 4. Lọc theo thời gian diễn ra (Hành trình nằm TRONG khoảng start và end)
    // Logic: start_date của hành trình >= startDate của filter 
    // VÀ end_date của hành trình <= endDate của filter
    if (startDate || endDate) {
      if (startDate) {
        filter.start_date = { $gte: new Date(startDate) };
      }
      if (endDate) {
        filter.end_date = { $lte: new Date(endDate) };
      }
    }

    return await this.journeyRepo.find({
      where: filter,
      order: { created_at: -1 } as any,
      take: 50 
    });
  }

  async update(id: string, dto: UpdateJourneyDto, userId: string): Promise<Journey> {
    // Permission check: VIEWER không được phép cập nhật journey
    await this.permissionService.requireEditPermission(id, userId, 'Cập nhật thông tin hành trình');

    const journey = await this.accessService.getJourneyWithAccess(id, userId, 'EDIT');
    Object.assign(journey, dto);

    if (dto.start_date || dto.end_date) {
        const start = dto.start_date ? new Date(dto.start_date) : new Date(journey.start_date);
        const end = dto.end_date ? new Date(dto.end_date) : new Date(journey.end_date);
        await this.checkScheduleConflict(userId, start, end, id); 
    }
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
  
  async sendJoinRequest(journeyId: string, userId: string, dto: CreateJoinRequestDto) {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');
    if (journey.visibility !== JourneyVisibility.PUBLIC) throw new BadRequestException('Hành trình này không công khai');
    if (journey.owner_id === userId) throw new BadRequestException('Bạn là chủ sở hữu');

    await this.requestJoinJourney(journeyId, userId);
    this.notifyMembers(journey, journey.owner_id, `muốn tham gia hành trình: "${dto.message || ''}"`, undefined, userId);

    return { success: true, message: 'Đã gửi yêu cầu tham gia' };
  }

  async getPendingRequests(journeyId: string, userId: string) {
    return this.getPendingJoinRequests(journeyId, userId);
  }

  async replyJoinRequest(journeyId: string, requestUserId: string, userId: string, dto: ReplyJoinRequestDto) {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    if (dto.status === ReplyStatus.REJECTED) {
        await this.rejectMember(journeyId, requestUserId, userId);
    } else {
        await this.approveMember(journeyId, requestUserId, userId);
    }

    return { success: true, status: dto.status };
  }

  async addStop(journeyId: string, dto: AddStopDto, userId: string): Promise<Journey> {
    // Permission check: VIEWER không được phép add stop
    await this.permissionService.requireEditPermission(journeyId, userId, 'Thêm điểm dừng');

    const journey = await this.accessService.getJourneyWithAccess(journeyId, userId, 'EDIT');
    
    if (!ObjectId.isValid(dto.place_id)) {
        throw new BadRequestException('Place ID không hợp lệ');
    }
    
    const place = await this.placeRepo.findOne({ 
      where: { _id: new ObjectId(dto.place_id) }, 
      select: ['_id', 'name', 'is_partner', 'priceLevel', 'category'] as any 
    });
    
    if (!place) throw new NotFoundException('Địa điểm không tồn tại');
    
    const day = journey.days[dto.day_index];
    const dateStr = new Date(day.date).toISOString().split('T')[0];
    const currentMemberIds = journey.members?.map(m => m.user_id) || [];
    
    const isAccommodation = ['HOTEL', 'HOMESTAY'].includes(place.category);

    if (dto.checkout_day_index !== undefined || dto.checkout_time) {
      if (!isAccommodation) {
        throw new BadRequestException('Tính năng thiết lập ngày/giờ trả phòng chỉ áp dụng cho nơi lưu trú (Khách sạn, Homestay).');
      }
      if (dto.checkout_day_index === undefined || !dto.checkout_time) {
        throw new BadRequestException('Vui lòng cung cấp đầy đủ cả ngày và giờ trả phòng.');
      }
    }

    let stopStatus = StopStatus.INFO_ONLY;
    let finalEstimatedCost = 0;

    if (place.is_partner) {
      const availabilityInfo = await this.bookingsService.getPlaceAvailability(dto.place_id, dateStr);
      if (availabilityInfo && availabilityInfo.length > 0) {
        const hasSlot = availabilityInfo.some(u => {
          const dayStatus = u.availability.find(d => d.date === dateStr);
          return (dayStatus?.available_count ?? 0) > 0;
        });
        if (!hasSlot) throw new BadRequestException(`Địa điểm đã HẾT CHỖ ngày ${dateStr}`);
      }
      stopStatus = StopStatus.PENDING;
      finalEstimatedCost = dto.estimated_cost || 0; 
    } else {
      stopStatus = StopStatus.INFO_ONLY;
      if (dto.estimated_cost !== undefined) {
         finalEstimatedCost = dto.estimated_cost;
      } else {
         const priceMap = { 0: 0, 1: 50000, 2: 150000, 3: 500000, 4: 1500000 };
         finalEstimatedCost = priceMap[place.priceLevel] || 0;
      }
    }

    if (isAccommodation && dto.checkout_day_index !== undefined && dto.checkout_time) {
      const checkInDay = journey.days[dto.day_index];
      const checkOutDay = journey.days[dto.checkout_day_index];
      
      if (!checkInDay || !checkOutDay) throw new NotFoundException('Ngày được chọn không hợp lệ');

      const checkInStartTime = dto.start_time || '14:00';
      const checkInEndTime = JourneyUtils.addMinutesToTime(checkInStartTime, 45); // Cộng 45p
      
      const checkInStop: JourneyStop = {
        _id: new ObjectId().toString(),
        place_id: dto.place_id,
        start_time: checkInStartTime,
        end_time: checkInEndTime,
        note: dto.note || 'Làm thủ tục nhận phòng',
        estimated_cost: finalEstimatedCost,
        is_manual_cost: dto.is_manual_cost || false,
        sequence: checkInDay.stops.length + 1,
        cost_type: dto.cost_type || CostType.SHARED,
        transit_from_previous: null,
        status: stopStatus,
        is_prepaid: dto.is_prepaid || false,
        participant_ids: dto.is_prepaid ? [] : (dto.participant_ids || [...currentMemberIds]),
        participant_checkins: [],
      };
      checkInDay.stops.push(checkInStop);

  
      const checkOutEndTime = dto.checkout_time;
      const checkOutStartTime = JourneyUtils.addMinutesToTime(checkOutEndTime, -30); // Trừ 30p
      
      const checkOutStop: JourneyStop = {
        _id: new ObjectId().toString(),
        place_id: dto.place_id,
        start_time: checkOutStartTime,
        end_time: checkOutEndTime,
        note: 'Dọn đồ và trả phòng',
        estimated_cost: 0,  
        is_manual_cost: false,
        sequence: checkOutDay.stops.length + 1,
        cost_type: CostType.SHARED,
        transit_from_previous: null,
        status: StopStatus.INFO_ONLY,
        is_prepaid: false,
        participant_ids: [...currentMemberIds],
        participant_checkins: [],
      };
      checkOutDay.stops.push(checkOutStop);

    } else { 
      const finalStartTime = dto.start_time || 
        (day.stops.length > 0 && dto.end_time 
          ? JourneyUtils.addMinutesToTime(dto.end_time, -60) 
          : '08:00');
      
      const newStop: JourneyStop = {
        _id: new ObjectId().toString(),
        place_id: dto.place_id,
        start_time: finalStartTime,
        end_time: dto.end_time || '09:00',
        note: dto.note,
        estimated_cost: finalEstimatedCost,
        sequence: day.stops.length + 1,
        is_manual_cost: dto.is_manual_cost || false,
        cost_type: dto.cost_type || CostType.PER_PERSON,
        transit_from_previous: null,
        status: stopStatus,
        is_prepaid: dto.is_prepaid || false,
        participant_ids: dto.is_prepaid 
          ? [] 
          : (dto.participant_ids && dto.participant_ids.length > 0 
              ? dto.participant_ids 
              : [...currentMemberIds]),
        participant_checkins: [],
      };
      day.stops.push(newStop);
    }

    await this.schedulerService.recalculateEntireJourney(journey);
    await this.budgetService.syncSmartBudget(journey);
    await this.journeyRepo.save(journey);
    
    this.userProfileService.scoreAction(userId, dto.place_id, UserActionType.ADD_TO_PLAN);
    this.notifyMembers(journey, userId, 'đã thêm địa điểm mới', dto.day_index + 1);
    
    return journey;
  }
  
  async updateStop(
  journeyId: string, 
  dayId: string, 
  stopId: string, 
  dto: UpdateStopDto, 
  userId: string
): Promise<Journey> {
  // Permission check: VIEWER không được phép cập nhật stop
  await this.permissionService.requireEditPermission(journeyId, userId, 'Cập nhật điểm dừng');

  const journey = await this.accessService.getJourneyWithAccess(journeyId, userId, 'EDIT');
  const day = journey.days.find(d => d.id === dayId);
  if (!day) throw new NotFoundException('Không tìm thấy ngày này trong lịch trình');

  const stop = day.stops.find(s => s._id === stopId);
  if (!stop) throw new NotFoundException('Không tìm thấy địa điểm này');

  if (dto.start_time !== undefined) stop.start_time = dto.start_time;
  if (dto.end_time !== undefined) stop.end_time = dto.end_time;
  if (dto.note !== undefined) stop.note = dto.note;
  if (dto.estimated_cost !== undefined) {
    if (stop.status === StopStatus.ARRIVED) {
      throw new BadRequestException('Không thể sửa chi phí dự kiến khi địa điểm đã check-in. Vui lòng cập nhật chi phí thực tế.');
    }
    stop.estimated_cost = dto.estimated_cost;
  }
  if (dto.is_manual_cost !== undefined) stop.is_manual_cost = dto.is_manual_cost;
  if (dto.cost_type !== undefined) stop.cost_type = dto.cost_type;

  const currentMemberIds = journey.members?.map(m => m.user_id) || [];

  if (dto.is_prepaid !== undefined) {
    stop.is_prepaid = dto.is_prepaid;
    if (dto.is_prepaid) {
      stop.participant_ids = []; 
    } else {
      stop.participant_ids = dto.participant_ids && dto.participant_ids.length > 0 
        ? dto.participant_ids 
        : [...currentMemberIds];
    }
  } 
  else if (dto.participant_ids !== undefined && !stop.is_prepaid) {
    stop.participant_ids = dto.participant_ids;
  }

  await this.schedulerService.recalculateEntireJourney(journey);
  await this.budgetService.syncSmartBudget(journey);
  await this.journeyRepo.save(journey);

  this.notifyMembers(journey, userId, 'đã cập nhật thông tin địa điểm', day.day_number);

  return journey;
}

  async moveStop(userId: string, dto: MoveStopDto): Promise<Journey> {
    // Permission check: VIEWER không được phép di chuyển stop
    await this.permissionService.requireEditPermission(dto.journey_id, userId, 'Di chuyển điểm dừng');

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
    // Permission check: VIEWER không được phép xóa stop
    await this.permissionService.requireEditPermission(journeyId, userId, 'Xóa điểm dừng');

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
           
           this.userProfileService.scoreAction(userId, stop.place_id, UserActionType.REMOVE_FROM_PLAN);

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

  // =================================================================
  // MEMBER MANAGEMENT
  // =================================================================

  private async checkScheduleConflict(userId: string, newStart: Date, newEnd: Date, excludeJourneyId?: string): Promise<void> {
    const query: any = {
      $or: [{ owner_id: userId }, { "members.user_id": userId }],
      status: { $nin: [JourneyStatus.COMPLETED, JourneyStatus.CANCELLED] },
      start_date: { $lte: newEnd },
      end_date: { $gte: newStart }
    };

    if (excludeJourneyId) {
      query._id = { $ne: new ObjectId(excludeJourneyId) };
    }

    const conflictingJourney = await this.journeyRepo.findOne({ where: query });
    
    if (conflictingJourney) {
      const startStr = new Date(conflictingJourney.start_date).toLocaleDateString('vi-VN');
      const endStr = new Date(conflictingJourney.end_date).toLocaleDateString('vi-VN');
      throw new ConflictException(
        `Trùng lịch! Bạn đã có hành trình "${conflictingJourney.name}" diễn ra từ ${startStr} đến ${endStr}.`
      );
    }
  }

  async joinJourney(inviteCode: string, userId: string): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { invite_code: inviteCode.toUpperCase() } });
    if (!journey) throw new NotFoundException('Mã mời không hợp lệ');
    await this.checkScheduleConflict(userId, new Date(journey.start_date), new Date(journey.end_date));
    const isMember = journey.members.some(m => m.user_id === userId);
    if (isMember) throw new ConflictException('Bạn đã là thành viên của hành trình này');

    const newMember: JourneyMember = {
      user_id: userId,
      role: JourneyMemberRole.MEMBER,
      joined_at: new Date()
    };

    journey.members.push(newMember);
    
    // Tự động tạo mã mời mới (Random 6 ký tự viết hoa)
    const newInviteCode = this.generateInviteCode();
    journey.invite_code = newInviteCode;
    
    await this.journeyRepo.save(journey);
    await this.budgetService.syncSmartBudget(journey);

    return journey;
  }

  async requestJoinJourney(journeyId: string, userId: string): Promise<void> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    const isMember = journey.members.some(m => m.user_id === userId);
    if (isMember) throw new BadRequestException('Bạn đã là thành viên của hành trình');

    const isRequested = journey.join_requests?.some(r => r.user_id === userId);
    if (isRequested) throw new BadRequestException('Yêu cầu của bạn đang chờ duyệt');

    await this.checkScheduleConflict(
        userId, 
        new Date(journey.start_date), 
        new Date(journey.end_date)
    );
    
    if (!journey.join_requests) journey.join_requests = [];
    
    journey.join_requests.push({
      user_id: userId,
      requested_at: new Date()
    });

    await this.journeyRepo.save(journey);
  }

  
  async getPendingJoinRequests(journeyId: string, userId: string): Promise<JourneyJoinRequest[]> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    if (journey.owner_id !== userId) {
      throw new ForbiddenException('Chỉ chủ sở hữu mới có thể xem yêu cầu tham gia');
    }

    return journey.join_requests || [];
  }

  async approveMember(journeyId: string, requestUserId: string, userId: string): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    if (journey.owner_id !== userId) {
      throw new ForbiddenException('Chỉ chủ sở hữu mới được duyệt thành viên');
    }

    const reqIndex = journey.join_requests?.findIndex(r => r.user_id === requestUserId);
    if (reqIndex === undefined || reqIndex === -1) {
      throw new NotFoundException('Yêu cầu không tồn tại');
    }

    journey.join_requests.splice(reqIndex, 1);
    journey.members.push({
      user_id: requestUserId,
      role: JourneyMemberRole.MEMBER,
      joined_at: new Date()
    });

    await this.journeyRepo.save(journey);
    await this.budgetService.syncSmartBudget(journey);

    this.notificationsService.createAndSend({
      recipient_id: requestUserId,
      sender_id: userId,
      type: NotificationType.SYSTEM,
      title: 'Yêu cầu tham gia',
      message: `Yêu cầu tham gia "${journey.name}" đã được chấp nhận!`,
      metadata: { journey_id: journeyId }
    });

    return journey;
  }

  async rejectMember(journeyId: string, requestUserId: string, userId: string): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    if (journey.owner_id !== userId) {
      throw new ForbiddenException('Chỉ chủ sở hữu mới được từ chối yêu cầu');
    }

    if (journey.join_requests) {
      journey.join_requests = journey.join_requests.filter(r => r.user_id !== requestUserId);
    }

    await this.journeyRepo.save(journey);

    this.notificationsService.createAndSend({
      recipient_id: requestUserId,
      sender_id: userId,
      type: NotificationType.SYSTEM,
      title: 'Yêu cầu tham gia',
      message: `Yêu cầu tham gia "${journey.name}" đã bị từ chối.`,
      metadata: { journey_id: journeyId }
    });

    return journey;
  }

  async removeMember(journeyId: string, memberUserId: string, userId: string): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    if (journey.owner_id !== userId) {
      throw new ForbiddenException('Chỉ chủ sở hữu mới được đuổi thành viên');
    }

    if (memberUserId === userId) {
      throw new BadRequestException('Không thể tự đuổi chính mình');
    }

    const memberExists = journey.members.some(m => m.user_id === memberUserId);
    if (!memberExists) {
      throw new NotFoundException('Thành viên không tồn tại trong hành trình');
    }

    journey.members = journey.members.filter(m => m.user_id !== memberUserId);
    await this.journeyRepo.save(journey);
    await this.budgetService.syncSmartBudget(journey);

    return journey;
  }

  async leaveJourney(journeyId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    if (journey.owner_id === userId) {
      throw new BadRequestException('Chủ sở hữu không được rời khỏi hành trình. Hãy xóa hành trình hoặc chuyển quyền trước.');
    }

    journey.members = journey.members.filter(m => m.user_id !== userId);
    await this.journeyRepo.save(journey);
    await this.budgetService.syncSmartBudget(journey);

    return { success: true, message: 'Đã rời khỏi hành trình thành công' };
  }

  async getJourneyAlbum(journeyId: string): Promise<AlbumItem[]> {
      const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
      if (!journey) throw new NotFoundException('Hành trình không tồn tại');

      // 2. Định nghĩa kiểu cho mảng album để tránh lỗi 'never'
      const album: AlbumItem[] = [];

      // Lấy ảnh check-in
      journey.days.forEach(day => {
        day.stops.forEach(stop => {
          if (stop.participant_checkins) {
            stop.participant_checkins.forEach(checkin => {
              if (checkin.check_in_image) {
                album.push({
                  source: 'check-in',
                  url: checkin.check_in_image,
                  user_id: checkin.user_id,
                  created_at: new Date(checkin.checked_in_at),
                  location_note: stop.note
                });
              }
            });
          }
        });
      });

      // 3. Lấy ảnh từ chat sử dụng chatMessageRepo đã được inject
      const chatMessages = await this.chatMessageRepo.find({
        where: { 
          journey_id: journeyId,
          type: MessageType.IMAGE // Đảm bảo bạn sử dụng đúng Enum Type của ChatMessage
        }
      });

      chatMessages.forEach(msg => {
        album.push({
          source: 'chat',
          url: msg.content,
          user_id: msg.sender_id,
          created_at: new Date(msg.created_at)
        });
      });

      return album.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    }

  // ==========================================
  // HOST TRANSFER & PERMISSION MANAGEMENT
  // ==========================================

  /**
   * HOST chuyển quyền cho một MEMBER khác
   * Yêu cầu:
   * - Chỉ HOST mới có thể chuyển (owner_id)
   * - Người nhận phải là MEMBER hoặc HOST
   * - Không thể chuyển cho VIEWER
   */
  async transferHostTo(journeyId: string, newHostUserId: string, currentHostUserId: string): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    // 1. Kiểm tra hiện tại là HOST
    if (journey.owner_id !== currentHostUserId) {
      throw new ForbiddenException('Chỉ HOST (chủ chuyến đi) mới có thể chuyển quyền');
    }

    // 2. Kiểm tra user mới tồn tại và là member
    const newHostMember = journey.members?.find(m => m.user_id === newHostUserId);
    if (!newHostMember) {
      throw new NotFoundException('Người dùng không phải là thành viên của hành trình');
    }

    // 3. Không thể chuyển cho VIEWER
    if (newHostMember.role === JourneyMemberRole.VIEWER) {
      throw new BadRequestException('Không thể chuyển quyền HOST cho VIEWER. Chỉ MEMBER hoặc những người không có role cụ thể mới có thể nhận.');
    }

    // 4. Không thể chuyển cho chính mình
    if (newHostUserId === currentHostUserId) {
      throw new BadRequestException('Bạn đã là HOST');
    }

    // 5. Chuyển quyền: Demote HOST cũ -> MEMBER, Promote MEMBER mới -> HOST
    const oldHostMember = journey.members.find(m => m.user_id === currentHostUserId);
    if (oldHostMember) {
      oldHostMember.role = JourneyMemberRole.MEMBER;
    }

    newHostMember.role = JourneyMemberRole.HOST;
    journey.owner_id = newHostUserId; // Cập nhật owner_id

    await this.journeyRepo.save(journey);

    // 6. Gửi notification
    await this.notificationsService.createAndSend({
      recipient_id: newHostUserId,
      sender_id: currentHostUserId,
      type: NotificationType.SYSTEM,
      title: 'Quyền hạn thay đổi',
      message: `Bạn đã được nâng lên làm HOST của hành trình "${journey.name}"`,
      metadata: { journey_id: journey._id.toString() },
    });

    // Thông báo cho các member khác
    await this.notifyMembers(
      journey,
      currentHostUserId,
      `đã chuyển quyền HOST cho ${newHostUserId}`
    );

    return journey;
  }

  /**
   * Lấy danh sách các member có thể nhận quyền HOST
   * (Dùng khi HOST muốn chuyển quyền, show danh sách candidates)
   */
  async getHostCandidates(journeyId: string, currentHostUserId: string): Promise<JourneyMember[]> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    if (journey.owner_id !== currentHostUserId) {
      throw new ForbiddenException('Chỉ HOST mới có thể xem danh sách ứng cử viên');
    }

    // Lọc: MEMBER hoặc HOST (không VIEWER), loại bỏ HOST hiện tại
    return (journey.members || []).filter(m =>
      m.user_id !== currentHostUserId &&
      (m.role === JourneyMemberRole.MEMBER || m.role === JourneyMemberRole.HOST)
    );
  }

  /**
   * Thay đổi role của một member (chỉ HOST)
   */
  async changeMemberRole(
    journeyId: string,
    targetMemberId: string,
    newRole: JourneyMemberRole,
    currentHostUserId: string
  ): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    // Chỉ HOST mới có thể thay đổi role
    if (journey.owner_id !== currentHostUserId) {
      throw new ForbiddenException('Chỉ HOST mới có quyền thay đổi role của thành viên');
    }

    // Không thể thay đổi role của chính mình
    if (targetMemberId === currentHostUserId) {
      throw new BadRequestException('Không thể thay đổi role của chính mình. Hãy chuyển quyền HOST trước.');
    }

    // Tìm member
    const memberIdx = journey.members?.findIndex(m => m.user_id === targetMemberId);
    if (memberIdx === undefined || memberIdx === -1) {
      throw new NotFoundException('Thành viên không tồn tại');
    }

    const oldRole = journey.members[memberIdx].role;
    journey.members[memberIdx].role = newRole;

    await this.journeyRepo.save(journey);

    // Notify
    const roleText = {
      [JourneyMemberRole.HOST]: 'HOST',
      [JourneyMemberRole.MEMBER]: 'MEMBER',
      [JourneyMemberRole.VIEWER]: 'VIEWER (Chỉ xem)',
    }[newRole];

    await this.notificationsService.createAndSend({
      recipient_id: targetMemberId,
      sender_id: currentHostUserId,
      type: NotificationType.SYSTEM,
      title: 'Role thay đổi',
      message: `Role của bạn trong hành trình "${journey.name}" đã được thay đổi thành ${roleText}`,
      metadata: { journey_id: journey._id.toString() },
    });

    return journey;
  }

  private async notifyMembers(journey: Journey, actorId: string, actionText: string, dayNumber?: number, senderId?: string) {
    try {
      let actorName = 'Thành viên nhóm';
      const actor = await this.usersService.findOne(actorId).catch(() => null);
      if (actor) actorName = actor.fullName;
      
      let message = `${actorName} ${actionText} trong hành trình "${journey.name}"`;
      if (dayNumber) message += ` (Ngày ${dayNumber})`;
      
      const recipients = journey.members
        .filter(m => m.user_id !== (senderId || actorId))
        .map(m => m.user_id);
      
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