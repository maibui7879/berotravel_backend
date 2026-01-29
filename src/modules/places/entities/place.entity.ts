import { Entity, ObjectIdColumn, Column, ObjectId, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { PlaceCategory, PlaceStatus } from '../../../common/constants';
import { ApiProperty } from '@nestjs/swagger';

@Entity('places')
export class Place {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column({ type: 'enum', enum: PlaceCategory })
  category: PlaceCategory;

  @Column()
  address: string;

  // Cấu trúc GeoJSON chuẩn cho MongoDB
  @Index('2dsphere')
  @Column('json')
  location: {
    type: string; // "Point"
    coordinates: number[]; // [lng, lat]
  };

  @Column('simple-array')
  images: string[];

  @Column()
  ownerId: string;
  
  @Column({ default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @Column({ nullable: true })
  priceLevel: number; 

  @Column('simple-array')
  tags: string[];

  @Column({ type: 'enum', enum: PlaceStatus, default: PlaceStatus.PENDING })
  status: PlaceStatus;

  @Column('json', { nullable: true })
  openingHours: {
    periods: {
      open: { day: number; time: string }; // 0 (CN) -> 6 (T7), "0800"
      close: { day: number; time: string };
    }[];
    weekday_text: string[]; // "Thứ Hai: 08:00 – 22:00"
  };

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  website: string;

  @Column({ default: 0 })
  favorites_count: number;

  @Column('simple-array', { nullable: true })
  amenities: string[];

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}