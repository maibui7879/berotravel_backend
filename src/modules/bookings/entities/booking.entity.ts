import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn } from 'typeorm';

@Entity('bookings')
export class Booking {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  user_id: string;

  @Column()
  place_id: string;

  @Column()
  unit_id: string;

  @Column()
  booking_type: string;

  @Column()
  check_in: Date;

  @Column({ nullable: true })
  check_out?: Date; // Dùng ? thay vì null

  @Column({ nullable: true })
  time_slot?: string;

  @Column()
  pax_count: number;

  @Column({ default: 'PENDING' })
  status: string;

  @Column()
  total_price: number;

  @CreateDateColumn()
  created_at: Date;
}