import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn } from 'typeorm';

export enum NotificationType {
  SYSTEM = 'SYSTEM',           // Thông báo hệ thống
  GROUP_INVITE = 'GROUP_INVITE', // Mời vào nhóm
  JOURNEY_UPDATE = 'JOURNEY_UPDATE', // Lịch trình thay đổi
  NEW_MESSAGE = 'NEW_MESSAGE', // Tin nhắn mới (nếu cần)
  PAYMENT = 'PAYMENT'          // Nhắc nợ/Thanh toán
}

@Entity('notifications')
export class Notification {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  recipient_id: string; // Người nhận thông báo

  @Column({ nullable: true })
  sender_id?: string;   // Người gửi (nếu có)

  @Column({ nullable: true })
  sender_avatar?: string; // Cache avatar để hiển thị nhanh

  @Column({ type: 'enum', enum: NotificationType, default: NotificationType.SYSTEM })
  type: NotificationType;

  @Column()
  title: string;

  @Column()
  message: string;

  @Column('json', { nullable: true })
  metadata?: any; // Dữ liệu đi kèm (VD: { group_id: "...", journey_id: "..." }) để client bấm vào thì navigate tới

  @Column({ default: false })
  is_read: boolean;

  @CreateDateColumn()
  created_at: Date;
}