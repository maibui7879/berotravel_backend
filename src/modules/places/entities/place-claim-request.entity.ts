import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum ClaimRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('place_claim_requests')
export class PlaceClaimRequest {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  place_id: string;

  @Column()
  user_id: string; // ID của merchant muốn claim

  @Column('array')
  business_proof: string[]; // Link ảnh giấy phép, chứng minh chủ sở hữu

  @Column({
    type: 'enum',
    enum: ClaimRequestStatus,
    default: ClaimRequestStatus.PENDING,
  })
  status: ClaimRequestStatus;

  @Column({ nullable: true })
  admin_note: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}