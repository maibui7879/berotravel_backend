import { Entity, ObjectIdColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ApiProperty } from '@nestjs/swagger';

export enum ReportReason {
  SPAM = 'SPAM',                           // Spam/Quảng cáo
  OFFENSIVE = 'OFFENSIVE',                 // Nội dung mạng lưới thô tục
  MISINFORMATION = 'MISINFORMATION',       // Thông tin sai lệch
  HARASSMENT = 'HARASSMENT',               // Qu騷rối/Lăng mạ
  INAPPROPRIATE = 'INAPPROPRIATE',         // Nội dung không phù hợp
  SCAM = 'SCAM',                           // Gian lận/Lừa đảo
  OTHERS = 'OTHERS'                        // Khác
}

export enum ReportStatus {
  PENDING = 'PENDING',      // Chờ xử lý
  REVIEWING = 'REVIEWING',  // Đang xem xét
  RESOLVED = 'RESOLVED',    // Đã xử lý
  DISMISSED = 'DISMISSED'   // Bác bỏ báo cáo
}

@Entity('forum_reports')
export class ForumReport {
  @ObjectIdColumn() _id: ObjectId;

  @Column() @Index() post_id: string;

  @Column() @Index() reporter_id: string;

  @Column() author_id: string;

  @Column({ type: 'enum', enum: ReportReason, default: ReportReason.OTHERS })
  @Index()
  reason: ReportReason;

  @Column({ nullable: true })
  description: string; // Mô tả chi tiết lý do báo cáo

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.PENDING })
  @Index()
  status: ReportStatus;

  @Column({ nullable: true })
  admin_notes: string; // Ghi chú của Admin khi xử lý

  @Column({ nullable: true })
  handled_by_admin_id: string; // Admin xử lý báo cáo

  @CreateDateColumn() created_at: Date;

  @Column({ nullable: true })
  resolved_at: Date;
}
