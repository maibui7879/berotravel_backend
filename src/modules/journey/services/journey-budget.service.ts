import { Injectable } from '@nestjs/common';
import { Journey, CostType, BudgetBreakdown, StopStatus } from '../entities/journey.entity';
import { CostEstimationService } from './cost-estimation.service';

@Injectable()
export class JourneyBudgetService {
  constructor(private readonly costService: CostEstimationService) {}

  async syncSmartBudget(journey: Journey): Promise<void> {
    try {
      const currentMemberIds = journey.members?.map(m => m.user_id) || [];
      const balances = new Map<string, { spent: number; estimated: number }>();
      
      // Khởi tạo balance cho tất cả thành viên
      currentMemberIds.forEach(id => balances.set(id, { spent: 0, estimated: 0 }));

      // 1. Tự động cập nhật participant_ids cho Stop PENDING nếu chưa có
      journey.days.forEach(day => {
        day.stops.forEach(stop => {
          if (stop.status === StopStatus.PENDING && (!stop.participant_ids || stop.participant_ids.length === 0)) {
            // Nếu là Prepaid (bao phòng), thường danh sách người tham gia trả tiền sẽ trống
            stop.participant_ids = stop.is_prepaid ? [] : [...currentMemberIds];
          }
        });
      });

      // 2. Duyệt qua các Stop để tính toán Balance riêng lẻ
      journey.days.forEach(day => {
        day.stops.forEach(stop => {
          // Nếu đã bao phòng (prepaid), chi phí đối với những người khác là 0
          if (stop.is_prepaid) return;

          const cost = stop.actual_cost !== undefined ? stop.actual_cost : (stop.estimated_cost || 0);
          if (cost === 0) return;

          const participants = stop.participant_ids || [];
          if (participants.length === 0) return;

          const amountPerPerson = stop.cost_type === CostType.SHARED 
            ? cost / participants.length 
            : cost;

          participants.forEach(uId => {
            const b = balances.get(uId);
            if (b) {
              if (stop.status === StopStatus.ARRIVED) b.spent += amountPerPerson;
              else b.estimated += amountPerPerson;
            }
          });
        });
      });

      // 3. Tính toán chi phí hệ thống (Accommodation & Transportation)
      const memberCountForEstimation = Math.max(journey.members?.length || 1, journey.planned_members_count || 1);
      const estimation = await this.costService.estimateJourneyBudget(
        journey._id.toString(),
        true, 
        memberCountForEstimation,
      );

      // Chi phí hệ thống mặc định chia đều cho những người hiện có (hoặc planned)
      const systemSharedPerPerson = Math.ceil(
        (estimation.accommodation.reduce((s, i) => s + i.subtotal, 0) +
        estimation.transportation.filter(t => t.is_shared).reduce((s, i) => s + i.estimated_cost, 0)) / memberCountForEstimation
      );

      // 4. Tổng hợp vào BudgetAnalysis
      const memberBalances = Array.from(balances.entries()).map(([uId, val]) => ({
        user_id: uId,
        total_spent: Math.ceil(val.spent),
        total_estimated: Math.ceil(val.estimated + systemSharedPerPerson)
      }));

      // Tính các chỉ số tổng quát dựa trên Owner (hoặc trung bình) để hiển thị Dashboard
      const totalShared = estimation.summary.grand_total;
      const grandTotalPerPerson = Math.ceil(totalShared / memberCountForEstimation);
      const limit = journey.budget_limit || 0;
      const isOver = limit > 0 && grandTotalPerPerson > limit;

      journey.budget_analysis = {
        total_shared: totalShared,
        share_per_person: grandTotalPerPerson,
        total_personal: 0,
        grand_total_per_person: grandTotalPerPerson,
        is_over_budget: isOver,
        over_amount: isOver ? (grandTotalPerPerson - limit) : 0,
        member_balances: memberBalances
      };

      journey.total_budget = totalShared;
      journey.cost_per_person = grandTotalPerPerson;

    } catch (error) {
      console.warn('Smart Budget Error:', error.message);
    }
  }
}