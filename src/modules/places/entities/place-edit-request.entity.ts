import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum EditRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('place_edit_requests')
export class PlaceEditRequest {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  place_id: string; // Địa điểm muốn sửa

  @Column()
  user_id: string; // Người đề xuất sửa

  // Lưu toàn bộ data user muốn sửa dưới dạng JSON
  // Ví dụ: { name: "Tên Mới", location: { lat: 10, lng: 20 } }
  @Column('json')
  update_data: any; 

  @Column({
    type: 'enum',
    enum: EditRequestStatus,
    default: EditRequestStatus.PENDING,
  })
  status: EditRequestStatus;

  @Column({ nullable: true })
  admin_note: string; // Lý do từ chối/duyệt

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}