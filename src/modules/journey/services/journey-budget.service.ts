import { Injectable } from '@nestjs/common';
import { Journey, CostType } from '../entities/journey.entity';
import { CostEstimationService } from './cost-estimation.service';

@Injectable()
export class JourneyBudgetService {
  constructor(private readonly costService: CostEstimationService) {}

  async syncSmartBudget(journey: Journey): Promise<void> {
    try {
      // 1. Xác định số người (Lấy max giữa thực tế và dự kiến để an toàn)
      const realCount = journey.members?.length || 1;
      const plannedCount = journey.planned_members_count || 1;
      const calcCount = Math.max(realCount, plannedCount);

      // 2. Gọi thuật toán tính toán
      const estimation = await this.costService.estimateJourneyBudget(
        journey._id.toString(),
        true, // Include Accommodation
        calcCount,
      );

      // 3. Cập nhật vào Entity
      journey.total_budget = estimation.summary.grand_total;
      journey.cost_per_person = estimation.summary.cost_per_person;
    } catch (error) {
      console.warn('Smart Budget Error:', error.message);
      this.fallbackBudgetCalculation(journey);
    }
  }

  private fallbackBudgetCalculation(journey: Journey) {
    const calcCount = Math.max(journey.members?.length || 1, journey.planned_members_count || 1);
    
    const simpleTotal = journey.days.reduce((t, d) =>
      t + d.stops.reduce((s, st) => {
        const cost = st.estimated_cost || 0;
        // Nếu Shared -> Cộng thẳng. Nếu Per Person -> Nhân lên
        return s + (st.cost_type === CostType.PER_PERSON ? cost * calcCount : cost);
      }, 0), 0
    );

    journey.total_budget = simpleTotal;
    journey.cost_per_person = Math.round(simpleTotal / calcCount);
  }
}