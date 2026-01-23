import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsDateString, IsOptional, IsNumber, IsArray, Min } from 'class-validator';

export class CreateJourneyDto {
  @ApiProperty({ example: 'Hành trình khám phá Phú Thọ' }) @IsNotEmpty() name: string;
  @ApiProperty({ example: '2026-01-15' }) @IsDateString() start_date: string;
  @ApiProperty({ example: '2026-01-17' }) @IsDateString() end_date: string;
  @ApiPropertyOptional({ description: 'Số người dự kiến đi (để chia tiền khi chưa đủ member)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  planned_members_count?: number;
}