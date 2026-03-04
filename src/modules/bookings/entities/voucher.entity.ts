import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum VoucherType {
  FIXED = 'FIXED',           // Giảm giá cố định (VND)
  PERCENT = 'PERCENT',       // Giảm giá %
  BOGO = 'BOGO',            // Buy One Get One
}

export enum VoucherStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED',
  DELETED = 'DELETED',
}

@Entity('vouchers')
export class Voucher {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  place_id: string; // Merchant chủ sở hữu voucher

  @Column()
  code: string; // Mã voucher (unique per place)

  @Column()
  title: string; // Tên chương trình khuyến mãi

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: VoucherType,
  })
  type: VoucherType; // FIXED, PERCENT, BOGO

  @Column()
  discount_value: number; // Giá trị giảm (không có dấu)

  @Column({ nullable: true })
  max_discount: number; // Giảm giá tối đa (cho percent)

  @Column({ nullable: true })
  min_order_value: number; // Giá trị đơn hàng tối thiểu

  @Column({ default: 0 })
  usage_count: number; // Số lần sử dụng

  @Column({ nullable: true })
  max_usage: number; // Giới hạn sử dụng (null = vô hạn)

  @Column()
  valid_from: Date;

  @Column()
  valid_until: Date;

  @Column({
    type: 'enum',
    enum: VoucherStatus,
    default: VoucherStatus.ACTIVE,
  })
  status: VoucherStatus;

  @Column('array', { default: [] })
  applicable_units: string[]; // Mảng unit_id applicable (empty = all)

  @Column({ nullable: true })
  target_user_group: string; // 'NEW_CUSTOMER', 'RETURNING', 'ALL'

  @Column({ default: false })
  is_combinable: boolean; // Có thể kết hợp với voucher khác

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
