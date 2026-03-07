// src/modules/ai/entities/ai-proposal.entity.ts
import { Entity, ObjectIdColumn, Column, CreateDateColumn, Index, ObjectId } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

// Cấu trúc Stop dành riêng cho AI (Chứa cả Reason và Score)
export class AiStop {
  @ApiProperty() place_id: string;
  @ApiProperty() place_name: string;
  @ApiProperty() estimated_cost_vnd: number;
  @ApiProperty() estimated_duration_minutes: number;
  @ApiProperty() reason: string;
  @ApiProperty() order: number;
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
  @ApiProperty() category: string;
  @ApiProperty() final_score: number;
  @ApiProperty() travel_time_from_previous_minutes: number;
  @ApiProperty() distance_from_previous_km: number;
}

export class AiDayPlan {
  @ApiProperty() day_number: number;
  @ApiProperty() date: Date;
  @ApiProperty({ type: [AiStop] }) stops: AiStop[];
  @ApiProperty() total_estimated_cost_vnd: number;
  @ApiProperty() summary: string;
}

@Entity('ai_proposals')
export class AiProposal {
  @ObjectIdColumn() _id: ObjectId;

  @Column() @Index() journey_id: string;

  @Column() user_id: string;

  @Column() mood_used: string;

  @Column('json') 
  @ApiProperty({ type: [AiDayPlan] })
  days: AiDayPlan[];

  @Column('json')
  @ApiProperty()
  candidate_pool: any[]; // Danh sách các điểm AI đã cân nhắc nhưng không chọn

  @Column('array')
  @ApiProperty()
  planning_notes: string[]; // Các ghi chú/cảnh báo từ AI

  @Column()
  total_budget_vnd: number;

  @Column()
  @Index({ expireAfterSeconds: 86400 }) 
  createdAt: Date;
}