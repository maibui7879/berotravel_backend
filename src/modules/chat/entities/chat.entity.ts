import { Entity, ObjectIdColumn, ObjectId, Column, UpdateDateColumn, CreateDateColumn } from 'typeorm';

export enum ConversationType {
  DIRECT = 'DIRECT',   // Chat 1-1
  JOURNEY = 'JOURNEY'  // Chat nhóm chuyến đi
}

@Entity('conversations')
export class ChatConversation {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ type: 'enum', enum: ConversationType, default: ConversationType.DIRECT })
  type: ConversationType;

  // Danh sách ID của những người tham gia (dùng cho DIRECT chat để dễ query)
  @Column('simple-array', { nullable: true })
  participant_ids: string[]; 

  // Nếu là phòng chat của chuyến đi thì lưu ID chuyến đi
  @Column({ nullable: true })
  journey_id?: string;

  // Tin nhắn cuối cùng để hiển thị ở danh sách chat
  @Column({ nullable: true })
  last_message?: string;

  @UpdateDateColumn()
  updated_at: Date;

  @CreateDateColumn()
  created_at: Date;
}