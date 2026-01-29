import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum FriendStatus {
  PENDING = 'PENDING',   // Đã gửi lời mời
  ACCEPTED = 'ACCEPTED', // Đã là bạn
  BLOCKED = 'BLOCKED'    // Chặn (Optional)
}

@Entity('friendships')
@Index(['requester_id', 'recipient_id'], { unique: true }) // Tránh spam request
export class Friendship {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  requester_id: string; // Người gửi

  @Column()
  recipient_id: string; // Người nhận

  @Column({ type: 'enum', enum: FriendStatus, default: FriendStatus.PENDING })
  status: FriendStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}