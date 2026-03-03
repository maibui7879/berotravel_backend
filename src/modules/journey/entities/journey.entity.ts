import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface TransitInfo {
  mode: 'DRIVING' | 'WALKING' | 'PUBLIC_TRANSPORT' | 'FLIGHT' | 'BOAT';
  distance_km: number;
  duration_minutes: number;
  from_place_id: string;
}

// [NEW] Member role enum (merged from Group)
export enum JourneyMemberRole {
  HOST = 'HOST',       // Trưởng nhóm/Chủ chuyến đi
  MEMBER = 'MEMBER',   // Thành viên
  VIEWER = 'VIEWER'    // Người xem
}

// [NEW] Member info class (merged from Group)
export class JourneyMember {
  @ApiProperty() user_id: string;
  @ApiProperty({ enum: JourneyMemberRole }) role: JourneyMemberRole;
  @ApiProperty() joined_at: Date;
}

// [NEW] Join request class (merged from Group)
export class JourneyJoinRequest {
  @ApiProperty() user_id: string;
  @ApiProperty() requested_at: Date;
}

export enum CostType {
  SHARED = 'SHARED',     
  PER_PERSON = 'PER_PERSON'  
}

// [NEW] Enum cho trạng thái Stop (Checklist)
export enum StopStatus {
  PENDING = 'PENDING',   // Chưa đến
  INFO_ONLY = 'INFO_ONLY', // [NEW] Chỉ thông tin (Dành cho Google Maps - Không giữ chỗ)
  ARRIVED = 'ARRIVED',   // Đã đến (Check-in)
  SKIPPED = 'SKIPPED'    // Bỏ qua
}

export enum JourneyVisibility {
  PRIVATE = 'PRIVATE',
  FRIENDS = 'FRIENDS', // Chỉ thành viên mới thấy
  PUBLIC = 'PUBLIC'    // Ai cũng thấy, ai cũng có thể Request Join
}

export interface MemberBalance {
  user_id: string;
  total_spent: number;    // Tiền đã chi thực tế (Stop Status: ARRIVED)
  total_estimated: number; // Tiền dự kiến cho tương lai (Stop Status: PENDING)
}

export class ParticipantCheckIn {
  @ApiProperty() user_id: string;
  @ApiProperty() checked_in_at: Date;
  @ApiPropertyOptional() actual_cost?: number;
  @ApiPropertyOptional() check_in_image?: string;
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
  participant_ids?: string[];
  status: StopStatus;
  actual_arrival_time?: Date | null;
  actual_cost?: number;
  check_in_image?: string | null;
  is_prepaid?: boolean;
  participant_checkins: ParticipantCheckIn[];   
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
  over_amount: number;   
  member_balances: MemberBalance[];        // Số tiền vượt
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

  // [MERGED] Detailed member list with roles
  @Column('json', { default: [] })
  @ApiProperty({ type: [JourneyMember] })
  members: JourneyMember[];

  // [MERGED] Invite code from Group
  @Column({ nullable: true })
  @Index('IDX_JOURNEY_INVITE_CODE', { unique: true, sparse: true })
  @ApiProperty()
  invite_code?: string;

  // [MERGED] Join requests from Group
  @Column('json', { default: [] })
  @ApiProperty({ type: [JourneyJoinRequest] })
  join_requests: JourneyJoinRequest[] = [];

  @Column() 
  start_date: Date;

  @Column({ default: 1 }) 
  planned_members_count: number;

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

  @Column({ default: 0 })
  favorites_count: number;
  
  @CreateDateColumn() 
  created_at: Date;

  @UpdateDateColumn() 
  updated_at: Date;
}