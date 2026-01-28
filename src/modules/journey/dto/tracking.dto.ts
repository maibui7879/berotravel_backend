import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class ResumeJourneyDto {
  @ApiProperty({ description: 'Ngày bắt đầu lại hành trình (thường là hôm nay)', example: '2026-02-14' })
  @IsDateString()
  new_start_date: string;
}

export class CheckInStopDto {
  @ApiPropertyOptional({ description: 'Chi phí thực tế đã chi', example: 150000 })
  @IsOptional()
  @IsNumber()
  actual_cost?: number;

  @ApiPropertyOptional({ description: 'True nếu số tiền trên là Tổng bill cả nhóm. False nếu là tiền chia đầu người.', default: false })
  @IsOptional()
  @IsBoolean()
  is_total_bill?: boolean;
  
  @ApiPropertyOptional({ description: 'Link ảnh check-in' })
  @IsOptional()
  @IsString()
  check_in_image?: string;
}