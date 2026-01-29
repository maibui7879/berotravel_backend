import { Entity, ObjectIdColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';

export enum FavoriteType {
  PLACE = 'PLACE',     // Lưu địa điểm
  JOURNEY = 'JOURNEY'  // Lưu hành trình của người khác
}

@Entity('favorites')
@Index(['user_id', 'target_id'], { unique: true }) // Một người chỉ like 1 cái 1 lần
export class Favorite {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  user_id: string;

  @Column()
  target_id: string; // ID của Place hoặc Journey

  @Column({ type: 'enum', enum: FavoriteType })
  type: FavoriteType;

  @CreateDateColumn()
  created_at: Date;
}