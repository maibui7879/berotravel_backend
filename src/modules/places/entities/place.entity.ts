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

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}