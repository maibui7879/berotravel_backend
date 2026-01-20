import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsDateString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class CreateJourneyDto {
  @ApiProperty({ example: 'Hành trình khám phá Phú Thọ' }) @IsNotEmpty() name: string;
  @ApiProperty({ example: '2026-01-15' }) @IsDateString() start_date: string;
  @ApiProperty({ example: '2026-01-17' }) @IsDateString() end_date: string;
}