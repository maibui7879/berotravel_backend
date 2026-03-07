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

@Injectable()
export class AiService {
  private readonly aiUrl: string;

  constructor(
    @InjectRepository(AiProposal) private proposalRepo: MongoRepository<AiProposal>,
    @InjectRepository(Journey) private journeyRepo: MongoRepository<Journey>,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    // Sửa lỗi: Cung cấp chuỗi rỗng nếu không tìm thấy biến môi trường
    this.aiUrl = this.configService.get<string>('AI_SERVICE_URL') || 'http://localhost:8000';
  }

  // Đổi tên hàm để khớp với Controller (Sửa lỗi TS2339)
  async generateAndSaveProposal(journeyId: string, userId: string, body: any) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiUrl}/journeys/${journeyId}/ai-plan`, body)
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
      throw new InternalServerErrorException('Lỗi kết nối AI: ' + e.message);
    }
  }

  async getProposalDetails(id: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(id) } });
    if (!proposal) throw new NotFoundException('Bản nháp AI không tồn tại');
    return proposal;
  }

  async acceptProposal(proposalId: string) {
    const proposal = await this.proposalRepo.findOne({ where: { _id: new ObjectId(proposalId) } });
    if (!proposal) throw new NotFoundException('Bản nháp không tồn tại');

    const journey = await this.journeyRepo.findOne({ where: { _id: new ObjectId(proposal.journey_id) } });
    if (!journey) throw new NotFoundException('Hành trình chính không tồn tại');

    // Sửa lỗi TS2322: Ép kiểu as any[] để vượt qua kiểm tra DeepPartial Entity của TypeORM
    const mappedDays: any[] = proposal.days.map((aiDay) => {
      let currentTime = new Date(aiDay.date);
      currentTime.setHours(8, 0, 0, 0);

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
            is_manual_cost: true,
            status: StopStatus.PENDING,
            participant_checkins: [],
            transit_from_previous: idx === 0 ? null : {
              mode: 'DRIVING' as any, // Ép kiểu literal
              distance_km: s.distance_from_previous_km,
              duration_minutes: s.travel_time_from_previous_minutes,
              from_place_id: aiDay.stops[idx - 1].place_id
            }
          };
        }),
      };
    });

    // Ép kiểu as any cho object update để tránh lỗi cấu trúc phức tạp (Sửa lỗi tại dòng 101)
    await this.journeyRepo.update(journey._id, {
      days: mappedDays,
      total_budget: proposal.days.reduce((sum, d) => sum + (d.total_estimated_cost_vnd || 0), 0),
      updated_at: new Date(),
    } as any);

    return { success: true, message: 'Đã cập nhật lịch trình từ AI' };
  }

  private formatHHmm(date: Date): string {
    return date.getHours().toString().padStart(2, '0') + ':' + 
           date.getMinutes().toString().padStart(2, '0');
  }
}