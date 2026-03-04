// journey/services/journey-budget.service.ts

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

      journey.days.forEach(day => {
        day.stops.forEach(stop => {
          if (stop.is_prepaid || stop.status === StopStatus.SKIPPED) return;

          const baseEstimatedCost = stop.estimated_cost || 0;
          const participants = (stop.participant_ids && stop.participant_ids.length > 0)
            ? stop.participant_ids 
            : currentMemberIds;

          const estimatedPerPerson = stop.cost_type === CostType.SHARED 
            ? baseEstimatedCost / (participants.length || 1) 
            : baseEstimatedCost;

          participants.forEach(uId => {
            const b = balances.get(uId);
            if (!b) return;

            const myCheckIn = stop.participant_checkins?.find(c => c.user_id === uId);

            if (myCheckIn) {
              const finalSpent = myCheckIn.actual_cost !== undefined 
                ? myCheckIn.actual_cost 
                : estimatedPerPerson;
              b.spent += finalSpent;
            } else {
              b.estimated += estimatedPerPerson;
            }
          });
        });
      });

      const memberCountForEstimation = Math.max(journey.members?.length || 1, journey.planned_members_count || 1);
      const estimation = await this.costService.estimateJourneyBudget(
        journey._id.toString(),
        true, 
        memberCountForEstimation,
      );

      const systemSharedPerPerson = Math.ceil(
        (estimation.accommodation.reduce((s, i) => s + i.subtotal, 0) +
        estimation.transportation.filter(t => t.is_shared).reduce((s, i) => s + i.estimated_cost, 0)) / memberCountForEstimation
      );

      const memberBalances = Array.from(balances.entries()).map(([uId, val]) => ({
        user_id: uId,
        total_spent: Math.ceil(val.spent),
        total_estimated: Math.ceil(val.estimated + systemSharedPerPerson)
      }));

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