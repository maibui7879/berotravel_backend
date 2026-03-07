// src/modules/ai/dto/request-ai-plan.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class LocationDto {
  @ApiProperty() @IsNumber() latitude: number;
  @ApiProperty() @IsNumber() longitude: number;
}

export class RequestAiPlanDto {
  @ApiProperty({ example: 'solo', enum: ['solo', 'group'] })
  @IsEnum(['solo', 'group'])
  mode: string;

  @ApiProperty({ example: 'RESET_HEALING' })
  @IsString()
  mood: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  total_budget_vnd: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  daily_budget_vnd: number;

  @ApiProperty()
  @ValidateNested()
  @Type(() => LocationDto)
  start_location: LocationDto;

  @ApiProperty({ example: 'balanced', enum: ['sightseeing', 'relaxing', 'balanced'] })
  @IsEnum(['sightseeing', 'relaxing', 'balanced'])
  travel_style: string;

  @ApiProperty({ default: 10 })
  @IsNumber()
  hours_per_day: number;

  @ApiProperty({ default: 5 })
  @IsNumber()
  max_places_per_day: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requester_user_id?: string;
}