import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsDateString, IsOptional, IsNumber, IsArray, Min, IsEnum } from 'class-validator';
import { JourneyVisibility } from '../entities/journey.entity';

export class CreateJourneyDto {
  @ApiProperty({ example: 'Hành trình khám phá Phú Thọ' }) 
  @IsNotEmpty() 
  name: string;

  @ApiProperty({ example: '2026-01-15' }) @IsDateString() 
  start_date: string;

  @ApiProperty({ example: '2026-01-17' }) @IsDateString() 
  end_date: string;
  
  @ApiPropertyOptional({ description: 'Ngân sách dự trù tối đa cho 1 người', example: 5000000 })
  @IsOptional()
  @IsNumber()
  budget_limit?: number;
  
  @ApiPropertyOptional({ description: 'Số người dự kiến đi (để chia tiền khi chưa đủ member)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  planned_members_count?: number;

  @ApiPropertyOptional({ enum: JourneyVisibility })
  @IsOptional()
  @IsEnum(JourneyVisibility)
  visibility?: JourneyVisibility;
}