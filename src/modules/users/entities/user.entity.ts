import { Entity, ObjectIdColumn, Column, ObjectId, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../../../common/constants';

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
}

export interface SocialProfile {
  providerId: string;
  email?: string;
  displayName?: string;
  picture?: string;
}

@Entity('users')
export class User {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column({ unique: true })
  email: string;

  @Column({ select: false, nullable: true }) 
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

  // Auth providers fields
  @Column({ type: 'array', default: ['email'] })
  authProviders: AuthProvider[];

  @Column('json', { nullable: true })
  socialProfiles: {
    facebook?: SocialProfile;
    google?: SocialProfile;
  };

  @Column({ nullable: true, select: false })
  hashedRt: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}