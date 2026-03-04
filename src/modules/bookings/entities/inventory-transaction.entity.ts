import { Entity, ObjectIdColumn, Column, CreateDateColumn, IndexOptions } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum TransactionType {
  IN = 'IN',                 // Nhập kho (Admin/Merchant cập nhật)
  OUT = 'OUT',              // Xuất kho (Booking confirmed)
  ADJUSTMENT = 'ADJUSTMENT', // Điều chỉnh (Hoàn hủy, sửa đơi)
  RESTOCK = 'RESTOCK',      // Nhập lại (Tái khôi phục)
}

@Entity('inventory_transactions')
export class InventoryTransaction {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  place_id: string;

  @Column()
  unit_id: string; // Reference to InventoryUnit

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  transaction_type: TransactionType;

  @Column()
  quantity_changed: number; // Số lượng thay đổi (âm hay dương)

  @Column()
  quantity_before: number;

  @Column()
  quantity_after: number;

  @Column({ nullable: true })
  reference_id: string; // ID của booking/promotional campaign

  @Column({ nullable: true })
  date_from: Date; // Ngày bắt đầu áp dụng

  @Column({ nullable: true })
  date_to: Date; // Ngày kết thúc

  @Column({ nullable: true })
  merchant_id: string; // Merchant thực hiện thay đổi (nếu là Merchant)

  @Column({ nullable: true })
  reason: string; // Lý do thay đổi

  @CreateDateColumn()
  created_at: Date;
}
