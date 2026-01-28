import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

export interface TransitInfo {
  mode: 'DRIVING' | 'WALKING' | 'PUBLIC_TRANSPORT' | 'FLIGHT' | 'BOAT';
  distance_km: number;
  duration_minutes: number;
  from_place_id: string;
}

export enum CostType {
  SHARED = 'SHARED',     
  PER_PERSON = 'PER_PERSON'  
}

// [NEW] Enum cho trạng thái Stop (Checklist)
export enum StopStatus {
  PENDING = 'PENDING',   // Chưa đến
  ARRIVED = 'ARRIVED',   // Đã đến (Check-in)
  SKIPPED = 'SKIPPED'    // Bỏ qua
}

export enum JourneyVisibility {
  PRIVATE = 'PRIVATE', // Chỉ thành viên mới thấy
  PUBLIC = 'PUBLIC'    // Ai cũng thấy, ai cũng có thể Request Join
}

export interface JourneyStop {
  _id: string; 
  place_id: string;
  start_time: string | null; // HH:mm
  end_time: string;   // HH:mm
  note?: string;
  estimated_cost: number;
  is_manual_cost?: boolean;
  sequence: number;
  cost_type?: CostType;
  transit_from_previous?: TransitInfo | null;
  is_manual_transit?: boolean;
  
  // [NEW] Tracking Fields
  status: StopStatus;
  actual_arrival_time?: Date | null;
  actual_cost?: number;
  check_in_image?: string | null;
}

export interface JourneyDay {
  id: string;
  day_number: number;
  date: Date;
  stops: JourneyStop[];
  warnings?: string[];
}

export interface BudgetBreakdown {
  total_shared: number;          // Tổng chi phí chung
  share_per_person: number;      // Tiền chung chia đầu người
  total_personal: number;        // Tổng chi phí riêng
  grand_total_per_person: number;// Tổng cộng 1 người
  is_over_budget: boolean;       // Cờ cảnh báo
  over_amount: number;           // Số tiền vượt
}

// [NEW] Enum cho trạng thái Journey
export enum JourneyStatus {
  PLANNING = 'PLANNING',   // Đang lên kế hoạch
  UPCOMING = 'UPCOMING',   // Sắp đi
  ON_GOING = 'ON_GOING',   // Đang đi (Active)
  PAUSED = 'PAUSED',       // Tạm dừng
  COMPLETED = 'COMPLETED', // Đã xong
  CANCELLED = 'CANCELLED'  // Hủy
}

@Entity('journeys')
export class Journey {
  @ObjectIdColumn() 
  _id: ObjectId;

  @Column() 
  name: string;

  @Column() 
  owner_id: string;

  @Column('array', { default: [] }) 
  members: string[];

  @Column() 
  start_date: Date;

  @Column({ default: 1 }) 
  planned_members_count: number;

  @Column({ nullable: true }) 
  group_id: string;

  @Column() 
  end_date: Date;
  
  @Column('json') 
  days: JourneyDay[];

  @Column({ default: 0 })
  budget_limit: number; 

  @Column('json', { nullable: true })
  budget_analysis: BudgetBreakdown;
  
  @Column({ default: 0 }) 
  total_budget: number;

  @Column({ default: 0 }) 
  cost_per_person: number; 

  // [NEW] Tracking Status
  @Column({ type: 'enum', enum: JourneyStatus, default: JourneyStatus.PLANNING })
  status: JourneyStatus;

  // [NEW] Progress Tracking
  @Column({ default: 0 })
  completed_stops_count: number; 

  @Column({ type: 'enum', enum: JourneyVisibility, default: JourneyVisibility.PRIVATE })
  visibility: JourneyVisibility;
  
  @Column({ default: 0 })
  total_stops_count: number;

  @CreateDateColumn() 
  created_at: Date;

  @UpdateDateColumn() 
  updated_at: Date;
}