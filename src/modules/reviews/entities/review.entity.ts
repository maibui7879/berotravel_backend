import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ReviewStatus {
  PUBLISHED = 'PUBLISHED',
  HIDDEN = 'HIDDEN',
  REPORTED = 'REPORTED'
}

@Entity('reviews')
export class Review {
  @ObjectIdColumn() _id: ObjectId;
  @Column() place_id: string;
  @Column() user_id: string;

  @Column('json')
  criteria: {
    cleanliness: number;
    service: number;
    location: number;
    price: number;
  };

  @Column() rating: number; // Trung bình cộng criteria
  @Column() content: string;
  @Column('array', { default: [] }) images: string[];
  @Column({ default: 0 }) helpful_count: number;
  @Column({ nullable: true }) merchant_reply: string;
  @Column({ default: false }) is_anonymous: boolean;
  @Column({ default: false }) is_verified: boolean; // True nếu đã từng booking COMPLETED
  @Column({ type: 'enum', enum: ReviewStatus, default: ReviewStatus.PUBLISHED }) status: ReviewStatus;

  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}