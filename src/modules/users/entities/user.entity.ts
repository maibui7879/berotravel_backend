import { Entity, ObjectIdColumn, Column, ObjectId, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../../../common/constants';

@Entity('users')
export class User {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ unique: true })
  email: string;

  @Column({ select: false }) 
  password: string;

  @Column()
  fullName: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ nullable: true })
  coverImage: string; // Ảnh bìa

  @Column({ nullable: true })
  bio: string; // Tiểu sử

  @Column({ nullable: true })
  birthday: Date; // Ngày sinh

  @Column('json', { nullable: true })
  preferences: string[];

  @Column({ nullable: true })
  travelStyle: string; 

  @Column({ nullable: true, select: false })
  hashedRt: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}