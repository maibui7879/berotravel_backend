import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

export interface TransitInfo {
  mode: 'DRIVING' | 'WALKING' | 'PUBLIC_TRANSPORT'; // [UPDATE] Thêm PUBLIC_TRANSPORT
  distance_km: number;
  duration_minutes: number;
  from_place_id: string;
}

export interface JourneyStop {
  _id: string; // ID duy nhất cho stop để dễ xóa/sửa
  place_id: string;
  start_time: string | null; // HH:mm
  end_time: string;   // HH:mm
  note?: string;
  estimated_cost: number;
  is_manual_cost?: boolean;
  sequence: number;
  transit_from_previous?: TransitInfo | null;
  
  // [OPTIONAL] Có thể thêm trường này để lưu thông tin place snapshot (tránh query lại)
  // place_snapshot?: { name: string; address: string; category: string }; 
}

export interface JourneyDay {
  id: string; // [UPDATE] Thêm ID cho ngày (hỗ trợ Frontend key)
  day_number: number;
  date: Date;
  stops: JourneyStop[];
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
  members: string[]; // Lưu user_id dưới dạng string

  @Column() 
  start_date: Date;

  @Column() 
  end_date: Date;
  
  @Column('json') 
  days: JourneyDay[]; // Lưu trữ phân cấp Ngày -> Stops

  @Column({ default: 0 }) 
  total_budget: number; // Tổng chi phí toàn bộ chuyến đi

  // [NEW] Chi phí bình quân đầu người (total_budget / members.length)
  @Column({ default: 0 }) 
  cost_per_person: number; 

  @Column({ default: 'PRIVATE' }) 
  status: 'PRIVATE' | 'PUBLIC' | 'GROUP';

  @CreateDateColumn() 
  created_at: Date;

  @UpdateDateColumn() 
  updated_at: Date;
}