// src/modules/forum/entities/forum.entity.ts

import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ForumCategory {
  REVIEW = 'REVIEW',
  EXPERIENCE = 'EXPERIENCE', // Kinh nghiệm phượt
  FIND_BUDDY = 'FIND_BUDDY', // Tìm bạn đồng hành
  QNA = 'QNA',               // Hỏi đáp
  OTHERS = 'OTHERS'
}

export enum PostStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  HIDDEN = 'HIDDEN'
}

export class PostStats {
  @ApiProperty() likes: number = 0;
  @ApiProperty() views: number = 0;
  @ApiProperty() comments: number = 0;
}

// Geo-tagging coordinates
export class LocationCoordinates {
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
  @ApiProperty({ nullable: true }) address?: string;
  @ApiProperty({ nullable: true }) place_name?: string;
}

// FIND_BUDDY specific fields
export class FindBuddyDetails {
  @ApiProperty({ description: 'Ngày khởi hành dự kiến' })
  travel_date: Date;

  @ApiProperty({ description: 'Ngân sách dự kiến (VND)' })
  budget_range: string; // Ví dụ: "1000000-3000000" hoặc "< 1000000"

  @ApiProperty({ description: 'Số người hiện có trong nhóm' })
  current_members: number;

  @ApiProperty({ description: 'Số người cần tìm' })
  looking_for_members: number;

  @ApiProperty({ description: 'Tổng số người mong muốn' })
  total_members_needed: number;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết về chuyến đi' })
  trip_description?: string;
}

@Entity('forum_posts')
export class ForumPost {
  @ObjectIdColumn() _id: ObjectId;

  @Column() @Index() author_id: string;

  @Column() title: string;

  @Column() content: string;

  @Column('json', { default: [] }) images: string[];

  @Column({ type: 'enum', enum: ForumCategory, default: ForumCategory.OTHERS })
  @Index()
  category: ForumCategory;

  @Column('json', { default: [] }) @Index() tag_ids: string[];

  @Column('json', { default: [] }) @Index() place_ids: string[];

  @Column({ nullable: true }) @Index() journey_id: string;

  @Column('json', { nullable: true })
  location?: LocationCoordinates; // Geo-tagging: Tọa độ địa điểm bài viết

  @Column('json', { nullable: true })
  find_buddy_details?: FindBuddyDetails; // FIND_BUDDY: Chi tiết tìm bạn đồng hành

  @Column('json') stats: PostStats = new PostStats();

  @Column('json', { default: [] }) liked_by: string[]; // Danh sách userId đã like

  @Column({ type: 'enum', enum: PostStatus, default: PostStatus.PUBLISHED })
  @Index()
  status: PostStatus;

  @Column({ default: false }) is_pinned: boolean;

  @Column({ default: 0 })
  reports_count: number; // Số lượng báo cáo

  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
export enum PostSortBy {
  LATEST = 'latest',     // Mới nhất
  POPULAR = 'popular',   // Nhiều Like nhất
  TRENDING = 'trending', // Nhiều bình luận/lượt xem nhất
}

export class ForumTag {
  @ObjectIdColumn() _id: ObjectId;

  @Column() @Index({ unique: true })
  name: string; // Tên hashtag (không bao gồm dấu #)

  @Column({ default: 0 })
  use_count: number; 

  @CreateDateColumn() created_at: Date;
}

@Entity('forum_comments')
export class ForumComment {
  @ObjectIdColumn() _id: ObjectId;

  @Column() @Index() post_id: string;

  @Column() @Index() author_id: string;

  @Column() content: string;

  @Column({ nullable: true }) @Index() parent_id: string; // Để làm comment đa cấp

  @Column('json', { default: [] }) liked_by: string[];

  @CreateDateColumn() created_at: Date;
}