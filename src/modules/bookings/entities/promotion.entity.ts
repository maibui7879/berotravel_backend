import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum PromotionType {
  HAPPY_HOUR = 'HAPPY_HOUR',     // Giảm giá theo khung giờ
  FLASH_SALE = 'FLASH_SALE',     // Sale nhất thời
  WEEKEND = 'WEEKEND',            // Khuyến mãi cuối tuần
  LOYALTY = 'LOYALTY',            // Chương trình khách hàng thân thiết
  SEASONAL = 'SEASONAL',          // Khuyến mãi theo mùa
}

export enum PromotionStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}

@Entity('promotions')
export class Promotion {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  place_id: string; // Merchant chủ sở hữu

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: PromotionType,
  })
  type: PromotionType;

  @Column({ nullable: true })
  banner_image: string;

  // Discount Info
  @Column()
  discount_type: 'FIXED' | 'PERCENT'; // Giảm cố định hay %

  @Column()
  discount_value: number;

  @Column({ nullable: true })
  max_discount: number; // Cho discount type PERCENT

  // Time Config (Khung giờ)
  @Column('array', { default: [] })
  active_days: number[]; // 0-6 (0 = Sunday, 6 = Saturday), empty = all days

  @Column({ nullable: true })
  start_hour: number; // 0-23 (nếu là HAPPY_HOUR)

  @Column({ nullable: true })
  end_hour: number; // 0-23

  // Date Range
  @Column()
  valid_from: Date;

  @Column()
  valid_until: Date;

  @Column({
    type: 'enum',
    enum: PromotionStatus,
    default: PromotionStatus.DRAFT,
  })
  status: PromotionStatus;

  // Target Units & Audience
  @Column('array', { default: [] })
  applicable_units: string[]; // Unit IDs (empty = all)

  @Column({ nullable: true })
  min_order_value: number;

  @Column({ nullable: true })
  max_usage_per_user: number;

  @Column({ default: 0 })
  total_usage: number;

  @Column({ nullable: true })
  max_total_usage: number; // Giới hạn tổng (null = vô hạn)

  // Additional Rules
  @Column({ default: false })
  weekends_only: boolean;

  @Column({ default: false })
  holidays_only: boolean;

  @Column({ nullable: true })
  excluded_dates: Date[]; // Ngày loại trừ

  @Column({ nullable: true })
  notes: string; // Ghi chú nội bộ cho merchant

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
