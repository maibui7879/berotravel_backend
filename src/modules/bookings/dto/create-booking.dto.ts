import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: '658f1a...', description: 'ID của Inventory Unit (Phòng/Bàn)' })
  @IsNotEmpty()
  @IsString()
  unit_id: string;

  @ApiProperty({ example: '2026-01-01', description: 'Ngày nhận phòng/Ngày ăn' })
  @IsNotEmpty()
  @IsDateString()
  check_in: string;

  @ApiProperty({ example: '2026-01-05', required: false, description: 'Ngày trả phòng (chỉ cho Hotel)' })
  @IsOptional()
  @IsDateString()
  check_out?: string;

  @ApiProperty({ example: '18:00', required: false, description: 'Khung giờ (chỉ cho Restaurant)' })
  @IsOptional()
  @IsString()
  time_slot?: string;

  @ApiProperty({ example: 2, description: 'Số lượng khách' })
  @IsNumber()
  @IsNotEmpty()
  pax_count: number;
}