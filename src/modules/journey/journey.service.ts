import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

// Entities
import { Journey, JourneyDay, JourneyStop } from './entities/journey.entity';
import { Place } from '../places/entities/place.entity';
import { NotificationType } from '../notification/entities/notification.entity';
import { Role } from 'src/common/constants';

// DTOs
import { CreateJourneyDto } from './dto/create-journey.dto';
import { UpdateJourneyDto } from './dto/update-journey.dto';
import { AddStopDto } from './dto/add-stop.dto';
import { MoveStopDto } from './dto/move-stop.dto';

// Services
import { GroupsService } from '../group/group.service';
import { NotificationsService } from '../notification/notification.service';
import { UsersService } from '../users/users.service';
import { CostEstimationService } from './services/cost-estimation.service';

interface CurrentUser {
  sub: string;
  role: Role;
}

@Injectable()
export class JourneysService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,

    // External Services
    private readonly groupsService: GroupsService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly costService: CostEstimationService,
  ) {}

  // =================================================================
  // PHẦN 1: CORE CRUD
  // =================================================================

  async create(dto: CreateJourneyDto, userId: string): Promise<Journey> {
    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);
    
    if (end < start) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');

    // 1. Tạo khung ngày (Journey Days)
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const days: JourneyDay[] = Array.from({ length: diffDays }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { 
        id: new ObjectId().toString(), 
        day_number: i + 1, 
        date, 
        stops: [] 
      };
    });

    // 2. Tạo Entity
    const journey = this.journeyRepo.create({
      ...dto,
      owner_id: userId,
      start_date: start,
      end_date: end,
      days,
      members: [userId],
      total_budget: 0, 
      cost_per_person: 0, // [UPDATED] Khởi tạo chi phí đầu người = 0
    });

    const savedJourney = await this.journeyRepo.save(journey);

    // 3. Tự động tạo Group Chat
    this.groupsService.create({
        name: `Nhóm: ${dto.name}`,
        journey_id: savedJourney._id.toString()
    }, userId).catch(err => console.error('Auto create group failed:', err));

    return savedJourney;
  }

  async findOne(id: string): Promise<Journey> {
    if (!ObjectId.isValid(id)) throw new BadRequestException('ID không hợp lệ');

    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    // [POPULATE] Lấy thông tin chi tiết Place để hiển thị
    const allPlaceIds = journey.days
        .flatMap(day => day.stops.map(s => s.place_id))
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

    if (allPlaceIds.length > 0) {
      const places = await this.placeRepo.find({
        where: { _id: { $in: allPlaceIds } } as any,
        select: ['name', 'image', 'address', 'location', 'category', 'rating_avg'] as any
      });
      const placeMap = new Map(places.map(p => [p._id.toString(), p]));

      journey.days.forEach(day => {
        day.stops.forEach(stop => {
          (stop as any).place_details = placeMap.get(stop.place_id);
        });
      });
    }

    return journey;
  }

  async findMyJourneys(userId: string): Promise<Journey[]> {
    return await this.journeyRepo.find({
      where: { $or: [{ owner_id: userId }, { members: { $in: [userId] } }] },
      order: { created_at: -1 } as any
    });
  }

  async update(id: string, dto: UpdateJourneyDto, userId: string): Promise<Journey> {
    const journey = await this.getJourneyWithAccess(id, userId, 'EDIT');
    Object.assign(journey, dto);

    // [OPTIONAL] Nếu thay đổi ngày, có thể cần logic regenerate days (phức tạp)
    // Ở đây giả định chỉ update tên, status...
    
    await this.journeyRepo.save(journey);
    this.notifyMembers(journey, userId, 'đã cập nhật thông tin chung');
    return journey;
  }

  async remove(id: string, user: CurrentUser) {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    const isOwner = journey.owner_id === user.sub;
    const isAdmin = user.role === Role.ADMIN;
    if (!isOwner && !isAdmin) throw new ForbiddenException('Bạn không có quyền xóa');

    await this.journeyRepo.delete(new ObjectId(id));
    return { success: true };
  }

  // =================================================================
  // PHẦN 2: SMART SCHEDULING & BUDGETING
  // =================================================================

  // 1. THÊM ĐỊA ĐIỂM
  async addStop(journeyId: string, dto: AddStopDto, userId: string): Promise<Journey> {
    const journey = await this.getJourneyWithAccess(journeyId, userId, 'EDIT');

    const day = journey.days[dto.day_index];
    if (!day) throw new BadRequestException('Ngày không hợp lệ');
    let finalCost = 0;
    let isManual = false;

    if (dto.is_manual_cost && dto.estimated_cost !== undefined) {
      // Trường hợp 1: User nhập tay
      finalCost = dto.estimated_cost;
      isManual = true;
    } else {
      // Trường hợp 2: User để trống -> Để thuật toán tự tính sau (tạm thời để 0)
      finalCost = 0;
      isManual = false; 
    }
    const newStop: JourneyStop = {
      _id: new ObjectId().toString(),
      place_id: dto.place_id,
      start_time: dto.start_time || '08:00',
      end_time: dto.end_time || '09:00',
      note: dto.note,
      estimated_cost: finalCost,
      sequence: day.stops.length + 1,
      transit_from_previous: null,
      is_manual_cost: isManual
    };

    day.stops.push(newStop);

    // A. Tính lại giờ giấc, khoảng cách
    await this.recalculateDaySchedule(day);
    
    // B. Tính lại ngân sách & chi phí đầu người
    await this.syncSmartBudget(journey);

    const savedJourney = await this.journeyRepo.save(journey);
    this.notifyMembers(journey, userId, 'đã thêm địa điểm mới', dto.day_index + 1);

    return savedJourney;
  }

  // 2. DI CHUYỂN ĐỊA ĐIỂM
  async moveStop(userId: string, dto: MoveStopDto): Promise<Journey> {
    const journey = await this.getJourneyWithAccess(dto.journey_id, userId, 'EDIT');

    const fromDay = journey.days.find(d => d.day_number === dto.from_day_number);
    const toDay = journey.days.find(d => d.day_number === dto.to_day_number);

    if (!fromDay || !toDay) throw new NotFoundException('Ngày không hợp lệ');

    const [movedStop] = fromDay.stops.splice(dto.old_index, 1);
    if (!movedStop) throw new NotFoundException('Stop không tồn tại');

    toDay.stops.splice(dto.new_index, 0, movedStop);

    await this.recalculateDaySchedule(fromDay);
    if (fromDay !== toDay) {
      await this.recalculateDaySchedule(toDay);
    }
    
    await this.syncSmartBudget(journey);

    const savedJourney = await this.journeyRepo.save(journey);
    this.notifyMembers(journey, userId, 'đã thay đổi thứ tự lịch trình');
    return savedJourney;
  }

  // 3. XÓA ĐỊA ĐIỂM
  async removeStop(journeyId: string, dayNumber: number, stopId: string, userId: string) {
    const journey = await this.getJourneyWithAccess(journeyId, userId, 'EDIT');
    const day = journey.days.find(d => d.day_number === dayNumber);
    
    if (day) {
      day.stops = day.stops.filter(s => s._id !== stopId);
      
      await this.recalculateDaySchedule(day);
      await this.syncSmartBudget(journey); 
      
      await this.journeyRepo.save(journey);
      this.notifyMembers(journey, userId, 'đã xóa một địa điểm', dayNumber);
    }
    return { success: true };
  }

  // =================================================================
  // PHẦN 3: LOGIC HELPERS
  // =================================================================

  /**
   * [UPDATED] Đồng bộ ngân sách (Tổng + Đầu người) từ CostEstimationService
   */
  private async syncSmartBudget(journey: Journey) {
    try {
      // 1. Xác định số thành viên (Tránh chia cho 0)
      const memberCount = journey.members?.length > 0 ? journey.members.length : 1;

      // 2. Gọi Service tính toán
      const estimation = await this.costService.estimateJourneyBudget(
        journey._id.toString(),
        true, // Bao gồm accommodation
        memberCount
      );

      // 3. Lưu kết quả vào Entity
      journey.total_budget = estimation.summary.grand_total;
      
      // [UPDATED] Lưu chi phí đầu người vào DB
      journey.cost_per_person = estimation.summary.cost_per_person;

    } catch (error) {
      console.warn('Smart Budget Error:', error.message);
      
      // Fallback: Tính tổng đơn giản
      const simpleTotal = journey.days.reduce((t, d) => 
        t + d.stops.reduce((s, st) => s + (st.estimated_cost || 0), 0), 0
      );
      
      journey.total_budget = simpleTotal;
      const members = journey.members?.length || 1;
      journey.cost_per_person = Math.round(simpleTotal / members);
    }
  }

  private async recalculateDaySchedule(day: JourneyDay) {
    if (day.stops.length === 0) return;

    const placeIds = day.stops
        .map(s => s.place_id)
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));
        
    const places = await this.placeRepo.find({ where: { _id: { $in: placeIds } } as any });
    const placeMap = new Map(places.map(p => [p._id.toString(), p]));

    for (let i = 0; i < day.stops.length; i++) {
      const currentStop = day.stops[i];
      const currentPlace = placeMap.get(currentStop.place_id);

      const durationMins = this.getTimeDifference(currentStop.start_time, currentStop.end_time);

      if (i === 0) {
        currentStop.transit_from_previous = null;
        if (!currentStop.start_time) currentStop.start_time = "08:00";
      } else {
        const prevStop = day.stops[i - 1];
        const prevPlace = placeMap.get(prevStop.place_id);

        if (prevPlace?.location?.coordinates && currentPlace?.location?.coordinates) {
          const dist = this.getHaversineDistance(
            prevPlace.location.coordinates[1], prevPlace.location.coordinates[0],
            currentPlace.location.coordinates[1], currentPlace.location.coordinates[0]
          );

          const travelMinutes = Math.ceil((dist / 35) * 60) + 15;

          currentStop.transit_from_previous = {
            mode: 'DRIVING', // Mặc định là Driving khi tính toán tự động
            distance_km: Number(dist.toFixed(1)),
            duration_minutes: travelMinutes,
            from_place_id: prevStop.place_id
          };

          currentStop.start_time = this.addMinutesToTime(prevStop.end_time, travelMinutes);
        } else {
          currentStop.transit_from_previous = null;
          currentStop.start_time = this.addMinutesToTime(prevStop.end_time, 30);
        }
      }

      currentStop.end_time = this.addMinutesToTime(currentStop.start_time, durationMins);
      currentStop.sequence = i + 1;
    }
  }

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
                title: 'Cập nhật lịch trình 📅',
                message: message,
                metadata: { journey_id: journey._id.toString() }
            })
        ));
    } catch (e) {
        console.error('Notification error:', e);
    }
  }

  private async getJourneyWithAccess(journeyId: string, userId: string, mode: 'VIEW' | 'EDIT' = 'VIEW'): Promise<Journey> {
    if (!ObjectId.isValid(journeyId)) throw new BadRequestException('ID không hợp lệ');
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    const isOwner = journey.owner_id === userId;
    const isMember = journey.members.includes(userId);

    if (mode === 'EDIT' && !isOwner && !isMember) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa hành trình này');
    }
    return journey;
  }

  // --- MATH HELPERS ---
  private getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; 
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private deg2rad(deg: number): number { return deg * (Math.PI/180); }

  private addMinutesToTime(time: string | null | undefined, mins: number): string {
    const safeTime = time || '08:00';
    const [h, m] = safeTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins, 0, 0);
    return `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
  }

  private getTimeDifference(start: string | null | undefined, end: string | null | undefined): number {
    if (!start || !end) return 60;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    return diff > 0 ? diff : 60;
  }
}