import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('bookings')
export class Booking {
  @ApiProperty({ type: 'string', example: '658f1a...' })
  @ObjectIdColumn()
  _id: ObjectId;

  @ApiProperty({ type: 'string' })
  @Column()
  user_id: string;

  @ApiProperty({ type: 'string' })
  @Column()
  place_id: string;

  @ApiProperty({ type: 'string' })
  @Column()
  unit_id: string;

  @ApiProperty({ type: 'string', enum: ['ROOM', 'TABLE', 'HOUSE'] })
  @Column()
  booking_type: string;

  @ApiProperty({ type: 'string' })
  @Column()
  check_in: Date;

  @ApiProperty({ type: 'string', required: false })
  @Column({ nullable: true })
  check_out?: Date;

  @ApiProperty({ type: 'string', required: false })
  @Column({ nullable: true })
  time_slot?: string;

  @ApiProperty({ type: 'number' })
  @Column()
  pax_count: number;

  @ApiProperty({ type: 'string', default: 'PENDING' })
  @Column({ default: 'PENDING' })
  status: string;

  @ApiProperty({ type: 'number' })
  @Column()
  total_price: number;

  @ApiProperty({ type: 'string' })
  @CreateDateColumn()
  created_at: Date;
}