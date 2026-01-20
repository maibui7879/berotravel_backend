import { Entity, ObjectIdColumn, ObjectId, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum GroupRole {
  HOST = 'HOST',     // Trưởng nhóm
  MEMBER = 'MEMBER', // Thành viên
  VIEWER = 'VIEWER'  // Người xem
}

export class GroupMember {
  @ApiProperty() user_id: string;
  @ApiProperty({ enum: GroupRole }) role: GroupRole;
  @ApiProperty() joined_at: Date;
}

// [MỚI] Class lưu yêu cầu tham gia
export class GroupRequest {
  @ApiProperty() user_id: string;
  @ApiProperty() requested_at: Date;
}

@Entity('groups')
export class Group {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  @ApiProperty()
  name: string;

  @Column() 
  @Index('IDX_GROUP_INVITE_CODE', { unique: true }) 
  @ApiProperty()
  invite_code: string;

  @Column()
  @ApiProperty()
  owner_id: string; 

  @Column({ nullable: true })
  @ApiProperty()
  active_journey_id?: string | null; 

  @Column('json', { default: [] })
  @ApiProperty({ type: [GroupMember] })
  members: GroupMember[];

  // [MỚI] Danh sách chờ duyệt
  @Column('json', { default: [] })
  @ApiProperty({ type: [GroupRequest] })
  join_requests: GroupRequest[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}