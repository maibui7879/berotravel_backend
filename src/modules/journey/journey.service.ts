import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';

// Entities
import { Journey, JourneyDay, JourneyStop } from './entities/journey.entity';
import { Place } from '../places/entities/place.entity';
import { NotificationType } from '../notification/entities/notification.entity';

// DTOs
import { CreateJourneyDto } from './dto/create-journey.dto';
import { UpdateJourneyDto } from './dto/update-journey.dto';
import { AddStopDto } from './dto/add-stop.dto';
import { MoveStopDto } from './dto/move-stop.dto';

// Common
import { Role } from 'src/common/constants';

// Services
import { GroupsService } from '../group/group.service';
import { NotificationsService } from '../notification/notification.service';
import { UsersService } from '../users/users.service';

interface CurrentUser {
  sub: string;
  role: Role;
}

@Injectable()
export class JourneysService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    @InjectRepository(Place) private readonly placeRepo: MongoRepository<Place>,

    // Inject Services khác để tương tác
    private readonly groupsService: GroupsService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  // =================================================================
  // PHẦN 1: CORE CRUD (Tạo, Xem, Sửa, Xóa)
  // =================================================================

  async create(dto: CreateJourneyDto, userId: string): Promise<Journey> {
    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);
    
    if (end < start) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');

    // 1. Tạo mảng ngày tự động dựa trên Start/End date
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

    // 2. Lưu Journey
    const journey = this.journeyRepo.create({
      ...dto,
      owner_id: userId,
      start_date: start,
      end_date: end,
      days,
      members: [userId], // Mặc định người tạo là thành viên
      total_budget: 0,
    });

    const savedJourney = await this.journeyRepo.save(journey);

    // 3. Tự động tạo Group Chat tương ứng
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

    // POPULATE: Lấy chi tiết địa điểm (Name, Image, Location...) để hiển thị
    // Gom tất cả place_id lại để query 1 lần (Performance Optimization)
    const allPlaceIds = journey.days.flatMap(day => day.stops.map(s => new ObjectId(s.place_id)));

    if (allPlaceIds.length > 0) {
      const places = await this.placeRepo.find({
        where: { _id: { $in: allPlaceIds } } as any,
        select: ['name', 'image', 'address', 'location', 'category', 'rating_avg'] as any
      });

      const placeMap = new Map(places.map(p => [p._id.toString(), p]));

      // Map dữ liệu Place vào từng Stop
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

    const savedJourney = await this.journeyRepo.save(journey);

    // Gửi thông báo
    this.notifyMembers(journey, userId, 'đã cập nhật thông tin chuyến đi');

    return savedJourney;
  }

  async remove(id: string, user: CurrentUser) {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    this.validateOwnershipOrAdmin(journey.owner_id, user);

    await this.journeyRepo.delete(new ObjectId(id));
    return { success: true };
  }

  private validateOwnershipOrAdmin(ownerId: string, user: CurrentUser): void {
    const isOwner = ownerId === user.sub;
    const isAdmin = user.role === Role.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }
  }

  // =================================================================
  // PHẦN 2: SMART SCHEDULING (Thêm, Xóa, Kéo thả & Tính toán)
  // =================================================================

  // 1. Thêm địa điểm mới -> Tính lại giờ -> Gửi thông báo
  async addStop(journeyId: string, dto: AddStopDto, userId: string): Promise<Journey> {
    const journey = await this.getJourneyWithAccess(journeyId, userId, 'EDIT');

    const day = journey.days[dto.day_index]; // Nếu dùng ID ngày thì đổi logic find
    if (!day) throw new BadRequestException('Ngày không hợp lệ');

    const newStop: JourneyStop = {
      _id: new ObjectId().toString(),
      place_id: dto.place_id,
      start_time: dto.start_time || '08:00', // Sẽ được tính lại bên dưới
      end_time: dto.end_time || '09:00',     // Sẽ được tính lại bên dưới
      note: dto.note,
      estimated_cost: dto.estimated_cost || 0,
      sequence: day.stops.length + 1,
      transit_from_previous: null
    };

    day.stops.push(newStop);

    // [QUAN TRỌNG] Tính lại lịch trình
    await this.recalculateDaySchedule(day);
    this.updateTotalBudget(journey);

    const savedJourney = await this.journeyRepo.save(journey);

    // Gửi thông báo cho nhóm
    this.notifyMembers(journey, userId, 'đã thêm địa điểm mới', dto.day_index + 1);

    return savedJourney;
  }

  // 2. Kéo thả địa điểm (Move) -> Tính lại giờ 2 ngày liên quan
  async moveStop(userId: string, dto: MoveStopDto): Promise<Journey> {
    const journey = await this.getJourneyWithAccess(dto.journey_id, userId, 'EDIT');

    const fromDay = journey.days.find(d => d.day_number === dto.from_day_number);
    const toDay = journey.days.find(d => d.day_number === dto.to_day_number);

    if (!fromDay || !toDay) throw new NotFoundException('Ngày không hợp lệ');

    // Cắt stop từ nguồn
    const [movedStop] = fromDay.stops.splice(dto.old_index, 1);
    if (!movedStop) throw new NotFoundException('Stop không tồn tại hoặc index sai');

    // Chèn vào đích
    toDay.stops.splice(dto.new_index, 0, movedStop);

    // Tính lại lịch trình cho cả ngày cũ và ngày mới
    await this.recalculateDaySchedule(fromDay);
    if (fromDay !== toDay) {
      await this.recalculateDaySchedule(toDay);
    }
    
    this.updateTotalBudget(journey);
    const savedJourney = await this.journeyRepo.save(journey);

    this.notifyMembers(journey, userId, 'đã thay đổi thứ tự lịch trình');

    return savedJourney;
  }

  // 3. Xóa địa điểm
  async removeStop(journeyId: string, dayNumber: number, stopId: string, userId: string) {
    const journey = await this.getJourneyWithAccess(journeyId, userId, 'EDIT');
    const day = journey.days.find(d => d.day_number === dayNumber);
    
    if (day) {
      day.stops = day.stops.filter(s => s._id !== stopId);
      
      await this.recalculateDaySchedule(day); // Tính lại giờ sau khi xóa để lấp khoảng trống
      this.updateTotalBudget(journey);
      
      await this.journeyRepo.save(journey);
      
      this.notifyMembers(journey, userId, 'đã xóa một địa điểm', dayNumber);
    }
    return { success: true };
  }

  // =================================================================
  // PHẦN 3: LOGIC HELPER (Tính toán & Bảo mật)
  // =================================================================

  /**
   * Hàm cốt lõi: Tính toán lại StartTime, EndTime, Transit cho toàn bộ Stop trong 1 ngày
   */
  private async recalculateDaySchedule(day: JourneyDay) {
    if (day.stops.length === 0) return;

    // Lấy tọa độ của tất cả địa điểm trong ngày
    const placeIds = day.stops.map(s => new ObjectId(s.place_id));
    const places = await this.placeRepo.find({ where: { _id: { $in: placeIds } } as any });
    const placeMap = new Map(places.map(p => [p._id.toString(), p]));

    for (let i = 0; i < day.stops.length; i++) {
      const currentStop = day.stops[i];
      const currentPlace = placeMap.get(currentStop.place_id);

      // Tính thời lượng chơi (Duration). Nếu null thì mặc định 60p
      const durationMins = this.getTimeDifference(currentStop.start_time, currentStop.end_time);

      if (i === 0) {
        // Điểm đầu tiên: Không có di chuyển đến
        currentStop.transit_from_previous = null;
        // Nếu chưa có giờ bắt đầu, set mặc định 08:00
        if (!currentStop.start_time) currentStop.start_time = "08:00";
      } else {
        // Các điểm sau: Tính khoảng cách từ điểm trước
        const prevStop = day.stops[i - 1];
        const prevPlace = placeMap.get(prevStop.place_id);

        if (prevPlace?.location?.coordinates && currentPlace?.location?.coordinates) {
          const dist = this.getHaversineDistance(
            prevPlace.location.coordinates[1], prevPlace.location.coordinates[0],
            currentPlace.location.coordinates[1], currentPlace.location.coordinates[0]
          );

          // Giả định tốc độ 35km/h + 15p delay/gửi xe
          const travelMinutes = Math.ceil((dist / 35) * 60) + 15;

          currentStop.transit_from_previous = {
            mode: 'DRIVING',
            distance_km: Number(dist.toFixed(1)),
            duration_minutes: travelMinutes,
            from_place_id: prevStop.place_id
          };

          // StartTime mới = EndTime cũ + Thời gian đi
          currentStop.start_time = this.addMinutesToTime(prevStop.end_time, travelMinutes);
        } else {
          // Fallback nếu thiếu tọa độ (set đi 30p)
          currentStop.transit_from_previous = null;
          currentStop.start_time = this.addMinutesToTime(prevStop.end_time, 30);
        }
      }

      // Cập nhật EndTime mới = StartTime mới + Duration cũ
      currentStop.end_time = this.addMinutesToTime(currentStop.start_time, durationMins);
      currentStop.sequence = i + 1;
    }
  }

  // Helper gửi thông báo cho tất cả thành viên (Trừ người làm)
  private async notifyMembers(journey: Journey, actorId: string, actionText: string, dayNumber?: number) {
    try {
        // Lấy tên người thao tác
        let actorName = 'Thành viên nhóm';
        const actor = await this.usersService.findOne(actorId).catch(() => null);
        if (actor) actorName = actor.fullName;

        let message = `${actorName} ${actionText} trong hành trình "${journey.name}"`;
        if (dayNumber) message += ` (Ngày ${dayNumber})`;

        // Lọc người nhận (Không gửi cho chính mình)
        const recipients = journey.members.filter(m => m !== actorId);

        // Gửi song song
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
        console.error('Error sending journey notifications:', e);
    }
  }

  // Middleware check quyền sở hữu
  private async getJourneyWithAccess(
    journeyId: string,
    userId: string,
    mode: 'VIEW' | 'EDIT' = 'VIEW'
  ): Promise<Journey> {
    if (!ObjectId.isValid(journeyId)) throw new BadRequestException('ID hành trình không hợp lệ');

    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    const isOwner = journey.owner_id === userId;
    const isMember = journey.members.includes(userId);

    if (mode === 'EDIT' && !isOwner && !isMember) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa hành trình này');
    }
    return journey;
  }

  private getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private deg2rad(deg: number): number { return deg * (Math.PI/180); }

  // Defensive coding: Xử lý time null/undefined
  private addMinutesToTime(time: string | null | undefined, mins: number): string {
    const safeTime = time || '08:00';
    const [h, m] = safeTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins, 0, 0);
    return `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
  }

  // Defensive coding: Xử lý time null/undefined
  private getTimeDifference(start: string | null | undefined, end: string | null | undefined): number {
    if (!start || !end) return 60; // Mặc định 60 phút nếu lỗi
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    return diff > 0 ? diff : 60; // Tránh số âm
  }

  private updateTotalBudget(journey: Journey) {
    journey.total_budget = journey.days.reduce((total, day) => 
      total + day.stops.reduce((subTotal, stop) => subTotal + (stop.estimated_cost || 0), 0)
    , 0);
  }
}