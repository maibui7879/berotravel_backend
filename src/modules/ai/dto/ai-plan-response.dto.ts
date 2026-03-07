// src/modules/ai/dto/ai-plan-response.dto.ts

export class AiStopDto {
  place_id: string;
  place_name: string;
  estimated_duration_minutes: number;
  reason: string;
  order: number;
  travel_time_from_previous_minutes: number;
  distance_from_previous_km: number;
  latitude: number;
  longitude: number;
  category: string;
  rating: number;
  estimated_cost_vnd: number;
  final_score: number;
  mood_score_breakdown: Record<string, number>;
  is_hotel_anchor: boolean;
}

export class AiDayDto {
  day_number: number;
  date: string; // ISO String từ AI
  stops: AiStopDto[];
  total_duration_minutes: number;
  total_travel_time_minutes: number;
  total_estimated_cost_vnd: number;
  total_distance_km: number;
  summary: string;
}

export class AiPlanRawResponseDto {
  journey_id: string;
  journey_name: string;
  total_days: number;
  mode: string;
  mood_used: string;
  total_budget_vnd: number;
  daily_budget_vnd: number;
  generated_at: string;
  days: AiDayDto[];
  candidate_pool: any[]; // Danh sách các điểm thay thế
  planning_notes: string[];
}