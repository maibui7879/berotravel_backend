import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';

@Entity('user_travel_profiles')
export class UserTravelProfile {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  @Index({ unique: true })
  user_id: string;

  @Column('json', { default: {} })
  interest_vector: Record<string, number>;

  @Column({ default: 0 })
  total_actions: number; 

  @Column('json', { default: [] })
  short_term_interests: { 
      tag: string; 
      score: number; 
      last_active: Date; 
  }[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}