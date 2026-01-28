import { Injectable } from '@nestjs/common';
import { Journey, CostType, BudgetBreakdown } from '../entities/journey.entity';
import { CostEstimationService } from './cost-estimation.service';

@Injectable()
export class JourneyBudgetService {
  constructor(private readonly costService: CostEstimationService) {}

  async syncSmartBudget(journey: Journey): Promise<void> {
    try {
      const memberCount = Math.max(journey.members?.length || 1, journey.planned_members_count || 1);

      const estimation = await this.costService.estimateJourneyBudget(
        journey._id.toString(),
        true, 
        memberCount,
      );

      let tempStopShared = 0;
      let tempStopPersonal = 0;

      journey.days.forEach(day => {
        day.stops.forEach(stop => {
          const cost = stop.estimated_cost || 0;
          if (cost === 0) return;

          if (stop.cost_type === CostType.SHARED) {
            tempStopShared += cost;
          } else {
            tempStopPersonal += cost;
          }
        });
      });

      const finalShared = 
          estimation.accommodation.reduce((s, i) => s + i.subtotal, 0) +
          estimation.transportation.filter(t => t.is_shared).reduce((s, i) => s + i.estimated_cost, 0) +
          tempStopShared;

      const transportPrivateTotal = estimation.transportation.filter(t => !t.is_shared).reduce((s, i) => s + i.estimated_cost, 0);
      
      const finalPersonal = 
          (transportPrivateTotal / memberCount) + 
          tempStopPersonal;

      const sharePerPerson = Math.ceil(finalShared / memberCount);
      const grandTotalPerPerson = sharePerPerson + finalPersonal;
      
      const limit = journey.budget_limit || 0;
      const isOver = limit > 0 && grandTotalPerPerson > limit;

      const analysis: BudgetBreakdown = {
          total_shared: finalShared,
          share_per_person: sharePerPerson,
          total_personal: finalPersonal,
          grand_total_per_person: grandTotalPerPerson,
          is_over_budget: isOver,
          over_amount: isOver ? (grandTotalPerPerson - limit) : 0
      };

      journey.budget_analysis = analysis;
      journey.total_budget = finalShared + (finalPersonal * memberCount);
      journey.cost_per_person = grandTotalPerPerson;

    } catch (error) {
      console.warn('Smart Budget Error:', error.message);
      this.fallbackBudgetCalculation(journey);
    }
  }

  private fallbackBudgetCalculation(journey: Journey) {
    const calcCount = Math.max(journey.members?.length || 1, journey.planned_members_count || 1);
    
    let totalShared = 0;
    let totalPersonal = 0;

    journey.days.forEach(d => {
        d.stops.forEach(st => {
            const cost = st.estimated_cost || 0;
            if (st.cost_type === CostType.SHARED) {
                totalShared += cost;
            } else {
                totalPersonal += cost;
            }
        });
    });

    const sharePerPerson = Math.ceil(totalShared / calcCount);
    const grandTotalPerPerson = sharePerPerson + totalPersonal;
    const limit = journey.budget_limit || 0;
    const isOver = limit > 0 && grandTotalPerPerson > limit;

    journey.budget_analysis = {
        total_shared: totalShared,
        share_per_person: sharePerPerson,
        total_personal: totalPersonal,
        grand_total_per_person: grandTotalPerPerson,
        is_over_budget: isOver,
        over_amount: isOver ? (grandTotalPerPerson - limit) : 0
    };

    journey.total_budget = totalShared + (totalPersonal * calcCount);
    journey.cost_per_person = grandTotalPerPerson;
  }
}