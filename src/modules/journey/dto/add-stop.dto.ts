import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsDateString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class AddStopDto {
  @ApiProperty({ description: 'Index của ngày (bắt đầu từ 0)' }) @IsNumber() day_index: number;
  @ApiProperty() @IsNotEmpty() place_id: string;
  @ApiProperty({ required: false, example: '08:00' }) @IsOptional() start_time?: string;
  @ApiProperty({ example: '10:00' }) @IsNotEmpty() end_time: string;
  @ApiProperty({ required: false }) @IsOptional() note?: string;
  @ApiProperty({ default: 0, description: 'Nếu để 0, hệ thống sẽ tự lấy giá từ DB' }) @IsNumber() estimated_cost: number;
}