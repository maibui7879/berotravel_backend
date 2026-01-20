import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export interface TransitInfo {
  mode: 'DRIVING' | 'WALKING';
  distance_km: number;
  duration_minutes: number;
  from_place_id: string;
}

export interface JourneyStop {
  _id: string;
  place_id: string;
  start_time: string | null; // HH:mm
  end_time: string;   // HH:mm
  note?: string;
  estimated_cost: number;
  sequence: number;
  transit_from_previous?: TransitInfo | null;
}

export interface JourneyDay {
  day_number: number;
  date: Date;
  stops: JourneyStop[];
}

@Entity('journeys')
export class Journey {
  @ObjectIdColumn() _id: ObjectId;
  @Column() name: string;
  @Column() owner_id: string;
  @Column('array', { default: [] }) members: string[];
  @Column() start_date: Date;
  @Column() end_date: Date;
  
  @Column('json') 
  days: JourneyDay[]; // Lưu trữ phân cấp Ngày -> Stops

  @Column({ default: 0 }) total_budget: number;
  @Column({ default: 'PRIVATE' }) status: 'PRIVATE' | 'PUBLIC' | 'GROUP';

  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}