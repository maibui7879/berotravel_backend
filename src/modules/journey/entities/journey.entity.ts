import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface TransitInfo {
  mode: 'DRIVING' | 'WALKING' | 'PUBLIC_TRANSPORT' | 'FLIGHT' | 'BOAT';
  distance_km: number;
  duration_minutes: number;
  from_place_id: string;
}

export enum JourneyTag {
  BEACH = 'BEACH',          // Biển
  MOUNTAIN = 'MOUNTAIN',    // Núi
  FOODIE = 'FOODIE',        // Ẩm thực
  ADVENTURE = 'ADVENTURE',  // Khám phá/Mạo hiểm
  RELAX = 'RELAX',          // Nghỉ dưỡng
  CULTURE = 'CULTURE',      // Văn hóa
  FAMILY = 'FAMILY',        // Gia đình
  COUPLE = 'COUPLE',        // Cặp đôi
  CHILL = 'CHILL',          // Đi chơi/Thư giãn
  NATURE = 'NATURE',        // Thiên nhiên
  CITY = 'CITY',            // Thành phố
  HISTORICAL = 'HISTORICAL', // Lịch sử
  CHILD_FRIENDLY = 'CHILD_FRIENDLY',
  AGE_RESTRICTED = 'AGE_RESTRICTED',// Thân thiện với trẻ em
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
  PER_PERSON = 'PER_PERSON' ,
  CUSTOM = 'CUSTOM' 
}

export interface PayerDetail {
  user_id: string;
  amount_paid: number; // Số tiền người này đã bỏ ra
}

export interface SplitDetail {
  user_id: string;
  amount_owed: number; // Số tiền người này phải chịu
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
  payers?: PayerDetail[];    
  splits?: SplitDetail[];
}

export interface JourneyDay {
  id: string;
  day_number: number;
  date: Date;
  stops: JourneyStop[];
  warnings?: string[];
}

export interface BudgetBreakdown {
  target_fund: number;           // TỔNG QUỸ NHÓM (= budget_limit * số thành viên)
  total_fund_spent: number;      // ĐÃ CHI
  remaining_fund: number;        // Còn lại trong quỹ
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

export interface ExtraExpense {
  id: string;
  title: string;
  amount: number;
  paid_by_user_id: string;
  date: Date;
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

  @Column({ nullable: true })
  @ApiPropertyOptional({ description: 'Ảnh đại diện của hành trình' })
  avatar?: string | null;

  @Column('json', { default: [] })
  @ApiProperty({ type: [String], description: 'Các tag phân loại (ví dụ: biển, núi, nghỉ dưỡng)' })
  tags: JourneyTag[] = [];

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

  @Column('json', { default: [] })
  extra_expenses: ExtraExpense[];
  
  @CreateDateColumn() 
  created_at: Date;

  @UpdateDateColumn() 
  updated_at: Date;
}