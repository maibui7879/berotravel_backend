import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Journey, JourneyStatus, StopStatus, CostType } from '../entities/journey.entity';
import { JourneyBudgetService } from './journey-budget.service';
import { BookingsService } from '../../bookings/bookings.service';
import { CheckInStopDto, ResumeJourneyDto } from '../dto/tracking.dto';
import { NotificationType } from '../../notification/entities/notification.entity';
import { NotificationsService } from '../../notification/notification.service';

@Injectable()
export class JourneyTrackingService {
  constructor(
    @InjectRepository(Journey) private readonly journeyRepo: MongoRepository<Journey>,
    private readonly budgetService: JourneyBudgetService,
    private readonly bookingsService: BookingsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async startJourney(journeyId: string, userId: string): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');
    if (journey.owner_id !== userId) throw new BadRequestException('Chỉ chủ sở hữu mới được bắt đầu');

    // [KHẮC PHỤC RỦI RO] Chốt số lượng người dự kiến bằng số người thực tế khi bắt đầu
    if (journey.members.length !== journey.planned_members_count) {
      journey.planned_members_count = journey.members.length;
    }

    await this.journeyRepo.updateMany(
      { owner_id: userId, status: JourneyStatus.ON_GOING },
      { $set: { status: JourneyStatus.PAUSED } }
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const plannedStart = new Date(journey.start_date);
    plannedStart.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - plannedStart.getTime();

    if (diffTime !== 0) {
        journey.start_date = today;
        journey.end_date = new Date(new Date(journey.end_date).getTime() + diffTime);
        journey.days.forEach(day => {
            const originalDate = new Date(day.date);
            day.date = new Date(originalDate.getTime() + diffTime);
        });
    }

    journey.status = JourneyStatus.ON_GOING;
    
    // Đồng bộ ngân sách theo số người đã chốt
    await this.budgetService.syncSmartBudget(journey);
    
    return await this.journeyRepo.save(journey);
  }

    async checkInStop(
    journeyId: string, 
    dayId: string, 
    stopId: string, 
    userId: string, 
    dto: CheckInStopDto
    ): Promise<Journey> {
        const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
        if (!journey) throw new NotFoundException('Hành trình không tồn tại');
        
        const day = journey.days.find(d => d.id === dayId);
        const stop = day?.stops.find(s => s._id === stopId);
        if (!stop) throw new NotFoundException('Stop không tồn tại');

        // Kiểm tra xem user có quyền tham gia Stop này không
        const isParticipant = stop.participant_ids?.includes(userId) || journey.owner_id === userId;
        if (!isParticipant) throw new BadRequestException('Bạn không nằm trong danh sách tham gia điểm này');

        // Khởi tạo mảng nếu chưa có
        if (!stop.participant_checkins) stop.participant_checkins = [];

        // Tìm bản ghi check-in cũ của user này (nếu có) để cập nhật hoặc thêm mới
        let userCheckIn = stop.participant_checkins.find(c => c.user_id === userId);
        
        if (userCheckIn) {
            userCheckIn.checked_in_at = new Date();
            userCheckIn.actual_cost = dto.actual_cost;
            userCheckIn.check_in_image = dto.check_in_image;
        } else {
            stop.participant_checkins.push({
            user_id: userId,
            checked_in_at: new Date(),
            actual_cost: dto.actual_cost,
            check_in_image: dto.check_in_image
            });
        }

        const targetParticipants = stop.participant_ids && stop.participant_ids.length > 0 
        ? stop.participant_ids 
        : journey.members.map(m => m.user_id);

        if (stop.participant_checkins.length >= targetParticipants.length) {
            stop.status = StopStatus.ARRIVED; 
        }

        if (stop.status === StopStatus.ARRIVED) {
            this.notificationsService.createAndSend({
                recipient_id: journey.owner_id,
                type: NotificationType.JOURNEY_UPDATE,
                title: 'Đã đông đủ!',
                message: `Tất cả thành viên đã check-in tại ${stop.note || 'địa điểm'}.`,
                metadata: { journey_id: journeyId }
            });
        }
        this.updateProgress(journey);
        await this.budgetService.syncSmartBudget(journey);
        return await this.journeyRepo.save(journey);
        }

    async pauseJourney(journeyId: string, userId: string): Promise<Journey> {
        const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
        if (!journey) throw new NotFoundException('Hành trình không tồn tại');
        if (journey.owner_id !== userId) throw new BadRequestException('Forbidden');

        journey.status = JourneyStatus.PAUSED;
        return await this.journeyRepo.save(journey);
  }

  // =================================================================
  // 3. RESUME JOURNEY (Release Old Booking + Partial Shift)
  // =================================================================
  async resumeJourney(journeyId: string, userId: string, dto: ResumeJourneyDto): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');
    if (journey.owner_id !== userId) throw new BadRequestException('Forbidden');

    const newStartForPending = new Date(dto.new_start_date);
    newStartForPending.setHours(0, 0, 0, 0);

    let firstPendingDayIndex = journey.days.findIndex(day => 
        day.stops.some(s => s.status === StopStatus.PENDING)
    );
    if (firstPendingDayIndex === -1 && journey.status !== JourneyStatus.COMPLETED) {
         firstPendingDayIndex = 0;
    }

    if (firstPendingDayIndex !== -1) {
        const originalPendingDate = new Date(journey.days[firstPendingDayIndex].date);
        originalPendingDate.setHours(0, 0, 0, 0);

        const diffTime = newStartForPending.getTime() - originalPendingDate.getTime();

        if (diffTime !== 0) {
            // [LOGIC RELEASE] Hoàn trả slot cho các ngày cũ trước khi dời lịch
            for (let i = firstPendingDayIndex; i < journey.days.length; i++) {
                const day = journey.days[i];
                const oldDateStr = new Date(day.date).toISOString().split('T')[0];

                for (const stop of day.stops) {
                    if (stop.status === StopStatus.PENDING) {
                        // Release ngày cũ
                        await this.bookingsService.releaseBookingSlot(
                            stop.place_id, 
                            oldDateStr, 
                            journey.members.length || 1
                        );
                    }
                }
            }

            // Dời lịch
            for (let i = firstPendingDayIndex; i < journey.days.length; i++) {
                const day = journey.days[i];
                const oldDate = new Date(day.date);
                day.date = new Date(oldDate.getTime() + diffTime);
            }
            
            journey.end_date = new Date(new Date(journey.end_date).getTime() + diffTime);
            if (firstPendingDayIndex === 0) {
                journey.start_date = newStartForPending;
            }
        }
    }

    await this.journeyRepo.updateMany(
      { owner_id: userId, status: JourneyStatus.ON_GOING },
      { $set: { status: JourneyStatus.PAUSED } }
    );

    journey.status = JourneyStatus.ON_GOING;
    return await this.journeyRepo.save(journey);
  }

  // =================================================================
  // 5. SKIP STOP (Release Booking Slot)
  // =================================================================
  async skipStop(journeyId: string, dayId: string, stopId: string, userId: string): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');

    const day = journey.days.find(d => d.id === dayId);
    if (!day) throw new NotFoundException('Day not found');

    const stop = day.stops.find(s => s._id === stopId);
    if (!stop) throw new NotFoundException('Stop not found');

    // [LOGIC RELEASE] Nếu chưa check-in -> Trả slot
    if (stop.status === StopStatus.PENDING) {
         const dateStr = new Date(day.date).toISOString().split('T')[0];
         await this.bookingsService.releaseBookingSlot(
             stop.place_id, 
             dateStr, 
             journey.members.length || 1
         );
    }

    stop.status = StopStatus.SKIPPED;
    stop.estimated_cost = 0; 

    this.updateProgress(journey);
    await this.budgetService.syncSmartBudget(journey);

    return await this.journeyRepo.save(journey);
  }

  // =================================================================
  // 6. CANCEL JOURNEY (Release All Pending Slots)
  // =================================================================
  async cancelJourney(journeyId: string, userId: string): Promise<Journey> {
    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
    if (!journey) throw new NotFoundException('Hành trình không tồn tại');
    if (journey.owner_id !== userId) throw new BadRequestException('Chỉ chủ sở hữu mới được hủy');

    // Duyệt qua tất cả các stop chưa đi để hoàn trả kho
    for (const day of journey.days) {
        const dateStr = new Date(day.date).toISOString().split('T')[0];
        for (const stop of day.stops) {
            // Chỉ hủy những cái chưa check-in/skipped
            if (stop.status === StopStatus.PENDING) {
                await this.bookingsService.releaseBookingSlot(
                    stop.place_id,
                    dateStr,
                    journey.members.length || 1
                );
            }
        }
    }

    journey.status = JourneyStatus.CANCELLED;
    return await this.journeyRepo.save(journey);
  }

  async getCheckInStatus(journeyId: string, dayId: string, stopId: string) {
  const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(journeyId) } });
  if (!journey) throw new NotFoundException('Hành trình không tồn tại');

  const day = journey.days.find(d => d.id === dayId);
  const stop = day?.stops.find(s => s._id === stopId);
  if (!stop) throw new NotFoundException('Stop không tồn tại');

  // Lấy danh sách ID những người cần tham gia (mặc định là tất cả thành viên nếu không chỉ định)
  const participants = stop.participant_ids && stop.participant_ids.length > 0 
    ? stop.participant_ids 
    : journey.members.map(m => m.user_id);

  // Lấy danh sách chi tiết những người đã check-in
  const checkedInUsers = stop.participant_checkins || [];

  return {
    stop_name: stop.note || 'Địa điểm không tên',
    total_participants: participants.length,
    checked_in_count: checkedInUsers.length,
    progress_percentage: participants.length > 0 
      ? Math.round((checkedInUsers.length / participants.length) * 100) 
      : 0,
    // Trả về danh sách chi tiết để hiển thị UI (avatar, tên, giờ check-in)
    check_in_list: checkedInUsers.map(checkin => ({
      user_id: checkin.user_id,
      checked_in_at: checkin.checked_in_at,
      image: checkin.check_in_image,
      is_completed: true
    })),
    // Danh sách những người chưa check-in
    pending_list: participants.filter(id => !checkedInUsers.some(c => c.user_id === id))
  };
}


  private updateProgress(journey: Journey) {
    let total = 0;
    let completed = 0;
    journey.days.forEach(d => {
        total += d.stops.length;
        completed += d.stops.filter(s => s.status === StopStatus.ARRIVED || s.status === StopStatus.SKIPPED).length;
    });
    journey.total_stops_count = total;
    journey.completed_stops_count = completed;
    if (total > 0 && total === completed) {
        journey.status = JourneyStatus.COMPLETED;
    }
  }
}