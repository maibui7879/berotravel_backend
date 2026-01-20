import { Entity, ObjectIdColumn, ObjectId, Column, Index } from 'typeorm';

@Entity('availability')
@Index('IDX_AVAILABILITY_UNIQUE', ['unit_id', 'date', 'time_slot'], { unique: true })
export class Availability {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  unit_id: string;

  @Column()
  date: Date;

  @Column({ nullable: true })
  time_slot?: string; 

  @Column({ default: 0 })
  booked_count: number;

  @Column()
  available_count: number;

  @Column({ nullable: true })
  price_override?: number;
}