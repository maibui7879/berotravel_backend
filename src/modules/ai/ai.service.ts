// src/modules/ai/ai.service.ts
import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AiProposal } from './entities/ai-proposal.entity';
import { Journey, StopStatus } from '../journey/entities/journey.entity';
import { RequestAiPlanDto } from './dto/request-ai-plan.dto';
import { UpdateAiProposalDto } from './dto/update-ai-proposal.dto';

@Injectable()
export class AiService {
  private readonly aiUrl: string;

  constructor(
    @InjectRepository(AiProposal) private proposalRepo: MongoRepository<AiProposal>,
    @InjectRepository(Journey) private journeyRepo: MongoRepository<Journey>,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    // Trỏ đến URL của AI service (Port 8000)
    this.aiUrl = this.configService.get<string>('AI_SERVICE_URL') || 'http://localhost:8000/api/v1';
  }

  /**
   * Gọi AI để lập kế hoạch và lưu thành một bản nháp có cấu trúc
   */
  async generateAndSaveProposal(journeyId: string, userId: string, dto: RequestAiPlanDto) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiUrl}/journeys/${journeyId}/ai-plan`, {
          ...dto,
          requester_user_id: userId
        })
      );
      const data = response.data;

      // Tạo bản nháp lưu đầy đủ metadata từ AI trả về
      const proposal = this.proposalRepo.create({
        journey_id: journeyId,
        user_id: userId,
        mood_used: data.mood_used,
        days: data.days,
        candidate_pool: data.candidate_pool || [],
        planning_notes: data.planning_notes || [],
        total_budget_vnd: data.total_budget_vnd,
        createdAt: new Date(),
      });

      return await this.proposalRepo.save(proposal);
    } catch (e) {
      throw new InternalServerErrorException('AI Service error: ' + (e.response?.data?.detail || e.message));
    }
  }

  /**
   * Lấy chi tiết bản nháp
   */
  async getProposalDetails(id: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!proposal) throw new NotFoundException('Không tìm thấy bản nháp AI');
    return proposal;
  }

  /**
   * Lấy danh sách các bản nháp của một hành trình (theo thứ tự mới nhất)
   */
  async getProposalsByJourney(journeyId: string) {
    return await this.proposalRepo.find({ 
      where: { journey_id: journeyId },
      order: { createdAt: -1 }
    });
  }

  /**
   * Xóa bản nháp
   */
  async deleteProposal(id: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!proposal) throw new NotFoundException('Không tìm thấy bản nháp AI');

    await this.proposalRepo.delete(proposal._id);
    return { success: true, message: 'Đã xóa bản nháp thành công' };
  }

  /**
   * Cho phép chỉnh sửa (fine-tune) trực tiếp trên bản nháp
   */
  async updateProposal(id: string, updateData: UpdateAiProposalDto) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!proposal) throw new NotFoundException('Không tìm thấy bản nháp AI');

    // 1. Cập nhật các trường cơ bản
    if (updateData.mood_used) proposal.mood_used = updateData.mood_used;
    if (updateData.planning_notes) proposal.planning_notes = updateData.planning_notes;

    // 2. Cập nhật dữ liệu ngày và điểm dừng (Fine-tuning)
    if (updateData.days && Array.isArray(updateData.days)) {
      proposal.days = proposal.days.map((existingDay, dayIdx) => {
        const updateDay = updateData.days?.[dayIdx];
        if (!updateDay) return existingDay;

        if (updateDay.day_number) existingDay.day_number = updateDay.day_number;
        if (updateDay.date) existingDay.date = new Date(updateDay.date);
        if (updateDay.summary) existingDay.summary = updateDay.summary;

        if (updateDay.stops && Array.isArray(updateDay.stops)) {
          existingDay.stops = existingDay.stops.map((existingStop, stopIdx) => {
            const updateStop = updateDay.stops?.[stopIdx];
            if (!updateStop) return existingStop;

            // Chỉ cập nhật những trường được phép sửa đổi thủ công
            if (updateStop.place_id) existingStop.place_id = updateStop.place_id;
            if (updateStop.place_name) existingStop.place_name = updateStop.place_name;
            if (updateStop.estimated_duration_minutes !== undefined) {
              existingStop.estimated_duration_minutes = updateStop.estimated_duration_minutes;
            }
            if (updateStop.estimated_cost_vnd !== undefined) {
              existingStop.estimated_cost_vnd = updateStop.estimated_cost_vnd;
            }
            if (updateStop.order !== undefined) existingStop.order = updateStop.order;

            return existingStop;
          });
        }

        // Tính lại tổng tiền của ngày sau khi sửa giá từng điểm
        existingDay.total_estimated_cost_vnd = existingDay.stops.reduce(
          (sum, stop) => sum + (stop.estimated_cost_vnd || 0), 0
        );

        return existingDay;
      });
    }

    // 3. Tính lại tổng ngân sách toàn chuyến đi
    proposal.total_budget_vnd = proposal.days.reduce(
      (sum, day) => sum + (day.total_estimated_cost_vnd || 0), 0
    );

    return await this.proposalRepo.save(proposal);
  }

  /**
   * Đổi một địa điểm trong bản nháp lấy một địa điểm dự phòng (Candidate Pool)
   */
  async swapPlaceInProposal(proposalId: string, dayNumber: number, oldPlaceId: string, newPlaceId: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(proposalId) } });
    if (!proposal) throw new NotFoundException('Bản nháp không tồn tại');

    const newPlace = proposal.candidate_pool.find(p => p.place_id === newPlaceId);
    if (!newPlace) throw new NotFoundException('Địa điểm mới không có trong danh sách dự phòng');

    const dayIndex = proposal.days.findIndex(d => d.day_number === dayNumber);
    if (dayIndex === -1) throw new NotFoundException(`Không tìm thấy ngày ${dayNumber}`);

    const stopIndex = proposal.days[dayIndex].stops.findIndex(s => s.place_id === oldPlaceId);
    if (stopIndex === -1) throw new NotFoundException(`Không tìm thấy địa điểm cũ trong ngày này`);

    // Thực hiện thay thế dữ liệu
    proposal.days[dayIndex].stops[stopIndex] = {
      ...proposal.days[dayIndex].stops[stopIndex],
      place_id: newPlace.place_id,
      place_name: newPlace.place_name,
      estimated_cost_vnd: newPlace.estimated_cost_vnd,
      category: newPlace.category,
      reason: 'Đã thay đổi từ danh sách gợi ý'
    };
    
    // Cập nhật lại các mốc ngân sách
    proposal.days[dayIndex].total_estimated_cost_vnd = proposal.days[dayIndex].stops.reduce((sum, s) => sum + s.estimated_cost_vnd, 0);
    proposal.total_budget_vnd = proposal.days.reduce((sum, d) => sum + d.total_estimated_cost_vnd, 0);

    return await this.proposalRepo.save(proposal);
  }

  async updateStopInProposal(
  proposalId: string, 
  dayNumber: number, 
  placeId: string, 
  updateDto: any // Có thể dùng Partial<AiStop>
) {
  const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(proposalId) } });
  if (!proposal) throw new NotFoundException('Bản nháp không tồn tại');

  const day = proposal.days.find(d => d.day_number === dayNumber);
  if (!day) throw new NotFoundException(`Không tìm thấy ngày ${dayNumber} trong bản nháp`);

  const stop = day.stops.find(s => s.place_id === placeId);
  if (!stop) throw new NotFoundException(`Không tìm thấy địa điểm ${placeId} trong ngày ${dayNumber}`);

  // Cập nhật các trường dữ liệu
  if (updateDto.estimated_duration_minutes !== undefined) {
    stop.estimated_duration_minutes = updateDto.estimated_duration_minutes;
  }
  if (updateDto.estimated_cost_vnd !== undefined) {
    stop.estimated_cost_vnd = updateDto.estimated_cost_vnd;
  }
  if (updateDto.order !== undefined) {
    stop.order = updateDto.order;
  }
  if (updateDto.reason) {
    stop.reason = updateDto.reason;
  }

  // TÍNH TOÁN LẠI NGÂN SÁCH (Cực kỳ quan trọng để giữ đồng bộ)
  day.total_estimated_cost_vnd = day.stops.reduce(
    (sum, s) => sum + (s.estimated_cost_vnd || 0), 0
  );
  
  proposal.total_budget_vnd = proposal.days.reduce(
    (sum, d) => sum + (d.total_estimated_cost_vnd || 0), 0
  );

  return await this.proposalRepo.save(proposal);
}

  /**
   * Chốt bản nháp: Map dữ liệu AI sang Journey thật và bật cờ is_manual_cost
   */
  async acceptProposal(proposalId: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(proposalId) } });
    if (!proposal) throw new NotFoundException('Không tìm thấy bản nháp');

    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(proposal.journey_id) } });
    if (!journey) throw new NotFoundException('Hành trình chính không tồn tại');

    // Chuyển đổi cấu trúc AiProposal.Day sang Journey.Day
    const mappedDays: any[] = proposal.days.map((aiDay) => {
      let currentTime = new Date(aiDay.date);
      currentTime.setHours(8, 0, 0, 0); // Mặc định bắt đầu lúc 8h sáng

      return {
        id: new ObjectId().toString(),
        day_number: aiDay.day_number,
        date: new Date(aiDay.date),
        stops: aiDay.stops.map((s, idx) => {
          const startTime = this.formatHHmm(currentTime);
          currentTime.setMinutes(currentTime.getMinutes() + s.estimated_duration_minutes);
          const endTime = this.formatHHmm(currentTime);
          
          currentTime.setMinutes(currentTime.getMinutes() + (s.travel_time_from_previous_minutes || 0));

          return {
            _id: new ObjectId().toString(),
            place_id: s.place_id,
            sequence: s.order,
            start_time: startTime,
            end_time: endTime,
            estimated_cost: s.estimated_cost_vnd,
            is_manual_cost: true, // QUAN TRỌNG: Khóa giá để backend không tự tính lại
            status: StopStatus.PENDING,
            participant_checkins: [],
            transit_from_previous: idx === 0 ? null : {
              mode: 'DRIVING' as any,
              distance_km: s.distance_from_previous_km || 0,
              duration_minutes: s.travel_time_from_previous_minutes || 0,
              from_place_id: aiDay.stops[idx - 1].place_id
            }
          };
        }),
      };
    });

    // Cập nhật hành trình chính
    await this.journeyRepo.update(journey._id, {
      days: mappedDays,
      total_budget: proposal.total_budget_vnd,
      updated_at: new Date(),
    } as any);

    return { success: true, message: 'Hành trình đã được cập nhật từ AI' };
  }

  /**
   * Proxy lấy giải thích thuật toán từ AI
   */
  async getAiExplanation(journeyId: string) {
    const response = await firstValueFrom(this.httpService.get(`${this.aiUrl}/journeys/${journeyId}/ai-explain`));
    return response.data;
  }

  /**
   * Proxy yêu cầu AI tối ưu lại đường đi cho 1 ngày
   */
  async optimizeDayRoute(journeyId: string, dayNumber: number) {
    const response = await firstValueFrom(this.httpService.post(`${this.aiUrl}/journeys/${journeyId}/days/${dayNumber}/improve-route-order`, {}));
    return response.data;
  }

  private formatHHmm(date: Date): string {
    return date.getHours().toString().padStart(2, '0') + ':' + 
           date.getMinutes().toString().padStart(2, '0');
  }
}