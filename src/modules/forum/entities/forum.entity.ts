// src/modules/forum/entities/forum.entity.ts

import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ApiProperty } from '@nestjs/swagger';

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

  @Column('json') stats: PostStats = new PostStats();

  @Column('json', { default: [] }) liked_by: string[]; // Danh sách userId đã like

  @Column({ type: 'enum', enum: PostStatus, default: PostStatus.PUBLISHED })
  @Index()
  status: PostStatus;

  @Column({ default: false }) is_pinned: boolean;

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

  @Column() author_id: string;

  @Column() content: string;

  @Column({ nullable: true }) @Index() parent_id: string; // Để làm comment đa cấp

  @Column('json', { default: [] }) liked_by: string[];

  @CreateDateColumn() created_at: Date;
}