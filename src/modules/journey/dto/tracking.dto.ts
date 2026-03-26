import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CostType } from '../entities/journey.entity';

export class ResumeJourneyDto {
  @ApiProperty({ description: 'Ngày bắt đầu lại hành trình (thường là hôm nay)', example: '2026-02-14' })
  @IsDateString()
  new_start_date: string;
}

export class PayerDetailDto {
  @IsString() user_id: string;
  @IsNumber() amount_paid: number;
}

export class SplitDetailDto {
  @IsString() user_id: string;
  @IsNumber() amount_owed: number;
}

export class CheckInStopDto {
  
  @ApiPropertyOptional({ description: 'Link ảnh check-in' })
  @IsOptional()
  @IsString()
  check_in_image?: string;
}

export class AddExtraExpenseDto {
  @ApiProperty({ description: 'Nội dung chi tiêu (VD: Mua nước)' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Số tiền chi (VNĐ)' })
  @IsNumber()
  amount: number;
}