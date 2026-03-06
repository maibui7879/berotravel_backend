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

  @Index('2dsphere')
  @Column('object')
  location: {
    type: string; // "Point"
    coordinates: number[]; // [lng, lat]
  };


  @Column('array')
  images: string[];

  @Column({ nullable: true })
  ownerId: string | null;
  
  @Column({ default: 0 })
  rating: number;

  @Column({ default: 0 })
  reviewCount: number;

  @Column({ nullable: true })
  priceLevel: number; 

  @Column({ default: 3 }) // Mặc định là 3 (mức trung bình) như logic crawler
  crowdLevel: number;
  // [FIX 3] Thay 'simple-array' thành 'array'
  @Column('array')
  tags: string[];

  @Column({ default: false })
  is_partner: boolean;
  
  @Column({ type: 'enum', enum: PlaceStatus, default: PlaceStatus.PENDING })
  status: PlaceStatus;

  // [FIX 4] Thay 'json' thành 'object'
  @Column('json', { nullable: true })
  openingHours: {
    periods: {
      open: { day: number; time: string }; 
      close: { day: number; time: string };
    }[];
    weekday_text: string[]; 
  };

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  website: string;

  @Column({ default: 0 })
  favorites_count: number;

  @Column('array', { nullable: true })
  amenities: string[];

  @Column()
  createdBy: string;

  @Column({ nullable: true, default: 0 })
  @ApiProperty({ description: 'Giá tiền ước tính (VNĐ)' })
  estimated_cost_vnd: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}