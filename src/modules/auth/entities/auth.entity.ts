import { Entity, ObjectIdColumn, Column, CreateDateColumn } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('auth')
export class Auth {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  user_id: string;

  @CreateDateColumn()
  created_at: Date;
}