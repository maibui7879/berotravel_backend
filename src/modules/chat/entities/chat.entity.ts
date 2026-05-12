import { Entity, ObjectIdColumn, ObjectId, Column, UpdateDateColumn, CreateDateColumn } from 'typeorm';

export enum ConversationType {
  DIRECT = 'DIRECT',   
  JOURNEY = 'JOURNEY'  
}

@Entity('conversations')
export class ChatConversation {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ type: 'enum', enum: ConversationType, default: ConversationType.DIRECT })
  type: ConversationType;

  @Column('simple-array', { nullable: true })
  participant_ids: string[]; 

  @Column({ nullable: true })
  journey_id?: string;

  @Column({ nullable: true })
  last_message?: string;

  @UpdateDateColumn()
  updated_at: Date;

  @CreateDateColumn()
  created_at: Date;
}