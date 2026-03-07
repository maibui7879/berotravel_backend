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
    this.aiUrl = this.configService.get<string>('AI_SERVICE_URL') || 'http://localhost:8000/api/v1';
  }

  async generateAndSaveProposal(journeyId: string, userId: string, dto: RequestAiPlanDto) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiUrl}/journeys/${journeyId}/ai-plan`, {
          ...dto,
          requester_user_id: userId
        })
      );
      const data = response.data;

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

  async getProposalDetails(id: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!proposal) throw new NotFoundException('AI Proposal not found');
    return proposal;
  }

  async getProposalsByJourney(journeyId: string) {
    const proposals = await this.proposalRepo.find({ 
      where: { journey_id: journeyId },
      order: { createdAt: -1 }
    });
    return proposals;
  }

  async deleteProposal(id: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!proposal) throw new NotFoundException('AI Proposal not found');

    const result = await this.proposalRepo.delete(proposal._id);
    
    if (result.affected === 0) {
      throw new NotFoundException('Failed to delete AI Proposal');
    }

    return { success: true, message: 'AI Proposal deleted successfully' };
  }

  async updateProposal(id: string, updateData: UpdateAiProposalDto) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!proposal) throw new NotFoundException('AI Proposal not found');

    // Cập nhật các field được phép
    if (updateData.mood_used) proposal.mood_used = updateData.mood_used;
    if (updateData.planning_notes) proposal.planning_notes = updateData.planning_notes;

    // Cập nhật mảng days nếu có
    if (updateData.days && Array.isArray(updateData.days)) {
      proposal.days = proposal.days.map((existingDay, dayIdx) => {
        const updateDay = updateData.days?.[dayIdx];
        if (!updateDay) return existingDay;

        // Cập nhật thông tin cơ bản của ngày
        if (updateDay.day_number) existingDay.day_number = updateDay.day_number;
        if (updateDay.date) existingDay.date = new Date(updateDay.date);
        if (updateDay.summary) existingDay.summary = updateDay.summary;

        // Cập nhật mảng stops
        if (updateDay.stops && Array.isArray(updateDay.stops)) {
          existingDay.stops = existingDay.stops.map((existingStop, stopIdx) => {
            const updateStop = updateDay.stops?.[stopIdx];
            if (!updateStop) return existingStop;

            // Cập nhật các field cho phép fine-tune
            if (updateStop.place_id) existingStop.place_id = updateStop.place_id;
            if (updateStop.place_name) existingStop.place_name = updateStop.place_name;
            if (updateStop.estimated_duration_minutes !== undefined) {
              existingStop.estimated_duration_minutes = updateStop.estimated_duration_minutes;
            }
            if (updateStop.estimated_cost_vnd !== undefined) {
              existingStop.estimated_cost_vnd = updateStop.estimated_cost_vnd;
            }
            if (updateStop.order !== undefined) existingStop.order = updateStop.order;
            if (updateStop.reason) existingStop.reason = updateStop.reason;
            if (updateStop.final_score !== undefined) existingStop.final_score = updateStop.final_score;
            if (updateStop.latitude !== undefined) existingStop.latitude = updateStop.latitude;
            if (updateStop.longitude !== undefined) existingStop.longitude = updateStop.longitude;
            if (updateStop.category) existingStop.category = updateStop.category;

            return existingStop;
          });
        }

        // Tính lại tổng giá cho ngày nếu có cập nhật stops
        if (updateDay.stops) {
          existingDay.total_estimated_cost_vnd = existingDay.stops.reduce(
            (sum, stop) => sum + (stop.estimated_cost_vnd || 0),
            0
          );
        }

        return existingDay;
      });
    }

    // Tính lại tổng ngân sách toàn bộ
    proposal.total_budget_vnd = proposal.days.reduce(
      (sum, day) => sum + (day.total_estimated_cost_vnd || 0),
      0
    );

    // TODO: Nếu người dùng đổi điểm (place_id changed), cần gọi endpoint improve-route-order
    // của AI service để tính lại quãng đường và thời gian di chuyển
    // if (updateData.needRouteUpdate) {
    //   await this.recalculateRouteWithAi(proposal);
    // }

    // Lưu lại proposal sau khi cập nhật
    return await this.proposalRepo.save(proposal);
  }

  // 1. Lấy giải thích từ AI
  async getAiExplanation(journeyId: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.aiUrl}/journeys/${journeyId}/ai-explain`)
      );
      return response.data;
    } catch (e) {
      throw new InternalServerErrorException('AI Service error: ' + (e.response?.data?.detail || e.message));
    }
  }

  // 2. Tối ưu lại thứ tự di chuyển trong ngày (Optimize Route)
  async optimizeDayRoute(journeyId: string, dayNumber: number) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiUrl}/journeys/${journeyId}/days/${dayNumber}/improve-route-order`, {})
      );
      return response.data; // AI sẽ trả về mảng stops đã sắp xếp lại
    } catch (e) {
      throw new InternalServerErrorException('AI Service error: ' + (e.response?.data?.detail || e.message));
    }
  }

  // 3. Đổi địa điểm trong bản nháp (Swap Place)
  async swapPlaceInProposal(proposalId: string, dayNumber: number, oldPlaceId: string, newPlaceId: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(proposalId) } });
    if (!proposal) throw new NotFoundException('Bản nháp không tồn tại');

    // Tìm điểm mới trong candidate_pool
    const newPlace = proposal.candidate_pool.find(p => p.place_id === newPlaceId);
    if (!newPlace) throw new NotFoundException('Địa điểm mới không có trong danh sách dự phòng');

    // Tìm và thay thế trong mảng days
    const dayIndex = proposal.days.findIndex(d => d.day_number === dayNumber);
    if (dayIndex > -1) {
      const stopIndex = proposal.days[dayIndex].stops.findIndex(s => s.place_id === oldPlaceId);
      if (stopIndex > -1) {
        // Cập nhật stop (giữ nguyên order, chỉ thay place và thông tin giá)
        proposal.days[dayIndex].stops[stopIndex] = {
          ...proposal.days[dayIndex].stops[stopIndex],
          place_id: newPlace.place_id,
          place_name: newPlace.place_name,
          estimated_cost_vnd: newPlace.estimated_cost_vnd,
          category: newPlace.category,
          reason: 'Người dùng tự đổi từ danh sách dự phòng'
        };
        
        // Cập nhật lại tổng tiền của ngày đó
        proposal.days[dayIndex].total_estimated_cost_vnd = proposal.days[dayIndex].stops
          .reduce((sum, s) => sum + s.estimated_cost_vnd, 0);
      } else {
        throw new NotFoundException(`Địa điểm cũ "${oldPlaceId}" không tìm thấy trong ngày ${dayNumber}`);
      }
    } else {
      throw new NotFoundException(`Ngày ${dayNumber} không tìm thấy trong bản nháp`);
    }

    // Tính lại tổng ngân sách toàn bộ
    proposal.total_budget_vnd = proposal.days.reduce(
      (sum, day) => sum + (day.total_estimated_cost_vnd || 0),
      0
    );

    return await this.proposalRepo.save(proposal);
  }

  async acceptProposal(proposalId: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(proposalId) } });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(proposal.journey_id) } });
    if (!journey) throw new NotFoundException('Journey not found');

    const mappedDays: any[] = proposal.days.map((aiDay) => {
      let currentTime = new Date(aiDay.date);
      currentTime.setHours(8, 0, 0, 0); // Start at 8 AM

      return {
        id: new ObjectId().toString(),
        day_number: aiDay.day_number,
        date: new Date(aiDay.date),
        stops: aiDay.stops.map((s, idx) => {
          const startTime = this.formatHHmm(currentTime);
          currentTime.setMinutes(currentTime.getMinutes() + s.estimated_duration_minutes);
          const endTime = this.formatHHmm(currentTime);
          
          currentTime.setMinutes(currentTime.getMinutes() + s.travel_time_from_previous_minutes);

          return {
            _id: new ObjectId().toString(),
            place_id: s.place_id,
            sequence: s.order,
            start_time: startTime,
            end_time: endTime,
            estimated_cost: s.estimated_cost_vnd,
            is_manual_cost: true, // Freeze price to match AI calculation
            status: StopStatus.PENDING,
            participant_checkins: [],
            transit_from_previous: idx === 0 ? null : {
              mode: 'DRIVING' as any,
              distance_km: s.distance_from_previous_km,
              duration_minutes: s.travel_time_from_previous_minutes,
              from_place_id: aiDay.stops[idx - 1].place_id
            }
          };
        }),
      };
    });

    await this.journeyRepo.update(journey._id, {
      days: mappedDays,
      total_budget: proposal.days.reduce((sum, d) => sum + (d.total_estimated_cost_vnd || 0), 0),
      updated_at: new Date(),
    } as any);

    return { success: true, message: 'Itinerary updated from AI proposal' };
  }

  private formatHHmm(date: Date): string {
    return date.getHours().toString().padStart(2, '0') + ':' + 
           date.getMinutes().toString().padStart(2, '0');
  }
}