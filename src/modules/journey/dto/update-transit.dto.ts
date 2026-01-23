import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTransitDto {
  @ApiProperty({ example: 'FLIGHT', enum: ['DRIVING', 'WALKING', 'PUBLIC_TRANSPORT', 'FLIGHT'] })
  @IsEnum(['DRIVING', 'WALKING', 'PUBLIC_TRANSPORT', 'FLIGHT', 'BOAT'])
  mode: string;

  @ApiProperty({ example: 120, description: 'Thời gian di chuyển (phút)' })
  @IsNumber()
  duration_minutes: number;

  @ApiProperty({ example: 500, description: 'Khoảng cách (km)' })
  @IsNumber()
  @IsOptional()
  distance_km: number;

  @ApiProperty({ example: 'Bay chuyến VJ123', required: false })
  @IsOptional()
  @IsString()
  detail?: string | null; 
}