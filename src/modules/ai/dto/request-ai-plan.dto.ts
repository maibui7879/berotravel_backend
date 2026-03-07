// src/modules/ai/dto/request-ai-plan.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsArray, ValidateNested, Min, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

class LocationDto {
  @ApiProperty({ example: 21.0285 }) @IsNumber() latitude: number;
  @ApiProperty({ example: 105.8542 }) @IsNumber() longitude: number;
}

export class RequestAiPlanDto {
  @ApiPropertyOptional({ example: 1, description: 'Số ngày muốn lập kế hoạch' })
  @IsOptional() @IsNumber()
  total_days?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsNumber() @Min(0)
  total_budget_vnd?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsNumber() @Min(0)
  daily_budget_vnd?: number;

  @ApiProperty({ example: 'solo', enum: ['solo', 'group'] })
  @IsEnum(['solo', 'group'])
  mode: string;

  @ApiProperty({ example: 'RESET_HEALING' })
  @IsString()
  mood: string;

  @ApiPropertyOptional({ 
    example: { 'RESET_HEALING': 1.0 },
    description: 'Phân bổ tỉ lệ tâm trạng' 
  })
  @IsOptional() @IsObject()
  mood_distribution?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional() @ValidateNested()
  @Type(() => LocationDto)
  start_location?: LocationDto;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional() @IsNumber() @Min(1)
  max_places_per_day?: number;

  @ApiPropertyOptional({ type: [String], example: ['RESTAURANT'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  must_include_categories?: string[];

  @ApiPropertyOptional({ type: [String], example: ['BAR'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  exclude_categories?: string[];

  @ApiPropertyOptional({ default: 8 })
  @IsOptional() @IsNumber()
  hours_per_day?: number;

  @ApiProperty({ example: 'balanced', enum: ['sightseeing', 'relaxing', 'balanced'] })
  @IsEnum(['sightseeing', 'relaxing', 'balanced'])
  travel_style: string;

}