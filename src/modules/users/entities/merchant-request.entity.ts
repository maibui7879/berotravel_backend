// src/modules/users/entities/merchant-request.entity.ts
import { Entity, Column, ObjectIdColumn, ObjectId, CreateDateColumn } from 'typeorm';

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('merchant_requests')
export class MerchantRequest {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  user_id: string;

  @Column()
  business_name: string;

  @Column()
  tax_code: string;

  @Column()
  address: string;

  @Column()
  phone_number: string;

  @Column({ type: 'enum', enum: RequestStatus, default: RequestStatus.PENDING })
  status: RequestStatus;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  admin_note: string;
}