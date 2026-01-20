import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',       // Metadata: { url: string }
  LOCATION = 'LOCATION', // Metadata: { lat, long, address }
  POLL = 'POLL',         // Metadata: { question, options: [{id, text, voters[]}] }
  SYSTEM = 'SYSTEM'
}

export class MessageReaction {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  emoji: string; // Các icon như: '👍', '❤️', '😂', '😮', '😢', '😡'
}

@Entity('chat_messages')
export class ChatMessage {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  group_id: string;

  @Column()
  sender_id: string;

  @Column({ nullable: true })
  sender_name?: string;

  @Column({ nullable: true })
  sender_avatar?: string;

  @Column({ nullable: true })
  content: string; // Nội dung text hiển thị hoặc caption

  @Column({ type: 'enum', enum: MessageType, default: MessageType.TEXT })
  type: MessageType;

  @Column('json', { default: [] })
  reactions: MessageReaction[];

  // Cột JSON quan trọng để lưu Poll, Ảnh, Vị trí
  @Column('json', { nullable: true })
  metadata: any;

  @Column({ nullable: true })
  reply_to_id?: string;

  @CreateDateColumn()
  created_at: Date;
}