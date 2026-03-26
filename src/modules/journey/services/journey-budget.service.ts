import { Injectable } from '@nestjs/common';
import { Journey, CostType, StopStatus } from '../entities/journey.entity';
import { CostEstimationService } from './cost-estimation.service';

@Injectable()
export class JourneyBudgetService {
  constructor(private readonly costService: CostEstimationService) {}

  async syncSmartBudget(journey: Journey): Promise<void> {
    try {
      const currentMemberIds = journey.members?.map(m => m.user_id) || [];
      const balances = new Map<string, { spent: number; estimated: number }>();
      
      currentMemberIds.forEach(id => balances.set(id, { spent: 0, estimated: 0 }));

      // 1. TÍNH CHI PHÍ TẠI CÁC ĐIỂM DỪNG (STOPS)
      journey.days.forEach(day => {
        day.stops.forEach(stop => {
          if (stop.is_prepaid || stop.status === StopStatus.SKIPPED) return;

          const isArrived = stop.status === StopStatus.ARRIVED;
          const participants = (stop.participant_ids && stop.participant_ids.length > 0)
            ? stop.participant_ids 
            : currentMemberIds;

          // Xác định Tổng Bill của Stop này
          const baseTotal = isArrived && stop.actual_cost !== undefined 
            ? stop.actual_cost 
            : (stop.estimated_cost || 0);

          const totalCostForStop = stop.cost_type === CostType.PER_PERSON 
            ? baseTotal * (participants.length || 1) 
            : baseTotal;

          // --- PHẦN 1: CỘNG TIỀN ĐÃ CHI (SPENT) ---
          if (isArrived) {
            if (stop.payers && stop.payers.length > 0) {
              // Mô hình mới: Đọc từ mảng payers (Hỗ trợ 1 hoặc nhiều người trả)
              stop.payers.forEach(p => {
                const b = balances.get(p.user_id);
                if (b) b.spent += p.amount_paid;
              });
            } else if (stop.participant_checkins && stop.participant_checkins.length > 0) {
              // Fallback tương thích ngược: Tìm người có actual_cost trong check-in cũ
              const payer = stop.participant_checkins.find(c => c.actual_cost && c.actual_cost > 0);
              if (payer) {
                const b = balances.get(payer.user_id);
                if (b) b.spent += payer.actual_cost ?? 0;
              }
            }
          }

          // --- PHẦN 2: TRỪ TIỀN PHẢI CHỊU (ESTIMATED/OWED) ---
          if (stop.cost_type === CostType.CUSTOM && stop.splits && stop.splits.length > 0) {
            // Ăn chia theo tỷ lệ/số tiền tùy chỉnh
            stop.splits.forEach(s => {
              const b = balances.get(s.user_id);
              if (b) b.estimated += s.amount_owed;
            });
} else {
            // Mặc định: Chia đều (Shared) hoặc Ai nấy trả (Per Person)
            const totalToSplit = stop.cost_type === CostType.PER_PERSON 
                ? baseTotal * (participants.length || 1) 
                : totalCostForStop;
                
            // [BỔ SUNG VÁ LỖI LÀM TRÒN]
            const splitAmount = Math.round(totalToSplit / (participants.length || 1));
            const remainder = totalToSplit - (splitAmount * (participants.length || 1)); 

            participants.forEach((uId, index) => {
              const b = balances.get(uId);
              if (b) {
                // Nhét số dư 1-2 đồng vào người đầu tiên để cân bằng quỹ
                b.estimated += splitAmount + (index === 0 ? remainder : 0);
              }
            });
          }
        });
      });

      // 2. TÍNH CỘNG DỒN CHI TIÊU LẶT VẶT (EXTRA EXPENSES)
      if (journey.extra_expenses && journey.extra_expenses.length > 0) {
        journey.extra_expenses.forEach(expense => {
          const b = balances.get(expense.paid_by_user_id);
          if (b) b.spent += expense.amount; // Cộng tiền cho người đã trả
        });
      }

      // 3. TÍNH TOÁN QUỸ NHÓM CHUNG (Giữ nguyên logic cũ của bạn)
      const limitPerPerson = journey.budget_limit || 0;
      const memberCountForEstimation = Math.max(journey.members?.length || 1, journey.planned_members_count || 1);
      
      const totalTargetFund = limitPerPerson * memberCountForEstimation;
      let totalFundSpent = 0;

      const estimation = await this.costService.estimateJourneyBudget(journey._id.toString(), true, memberCountForEstimation);
      const systemSharedPerPerson = Math.ceil(
        (estimation.accommodation.reduce((s, i) => s + i.subtotal, 0) +
        estimation.transportation.filter(t => t.is_shared).reduce((s, i) => s + i.estimated_cost, 0)) / memberCountForEstimation
      );

      const memberBalances = Array.from(balances.entries()).map(([uId, val]) => {
        totalFundSpent += val.spent; 
        
        return {
          user_id: uId,
          total_spent: Math.ceil(val.spent),
          total_estimated: Math.ceil(val.estimated + systemSharedPerPerson)
        };
      });

      const totalShared = estimation.summary.grand_total;
      const grandTotalPerPerson = Math.ceil(totalShared / memberCountForEstimation);
      const isOver = limitPerPerson > 0 && grandTotalPerPerson > limitPerPerson;

      journey.budget_analysis = {
        target_fund: totalTargetFund,
        total_fund_spent: totalFundSpent,
        remaining_fund: totalTargetFund - totalFundSpent, 
        total_shared: totalShared,
        share_per_person: grandTotalPerPerson,
        total_personal: 0,
        grand_total_per_person: grandTotalPerPerson,
        is_over_budget: isOver,
        over_amount: isOver ? (grandTotalPerPerson - limitPerPerson) : 0,
        member_balances: memberBalances 
      };

      journey.total_budget = totalTargetFund;
      journey.cost_per_person = limitPerPerson;

    } catch (error) {
      console.warn('Smart Budget Error:', error.message);
    }
  }
}