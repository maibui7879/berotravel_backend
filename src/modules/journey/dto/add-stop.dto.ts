import { ApiProperty, ApiPropertyOptional, ApiHideProperty } from '@nestjs/swagger'; // [1] Import ApiHideProperty
import { IsNotEmpty, IsString, IsDateString, IsOptional, IsNumber, IsArray, IsBoolean, IsEnum } from 'class-validator';
import { CostType } from '../entities/journey.entity';

export class AddStopDto {
  @ApiProperty({ description: 'Index của ngày (bắt đầu từ 0)' }) 
  @IsNumber() 
  day_index: number;

  @ApiProperty() 
  @IsNotEmpty() 
  place_id: string;

  @ApiProperty({ required: false, example: '08:00' }) 
  @IsOptional() 
  start_time?: string;

  @ApiProperty({ example: '10:00' }) 
  @IsNotEmpty() 
  end_time: string;

  @ApiProperty({ required: false }) 
  @IsOptional() 
  note?: string;

  // --- [SỬA] Ẩn estimated_cost ---
  @ApiHideProperty() 
  @IsNumber() 
  @IsOptional() 
  estimated_cost: number;

  @IsOptional()
  @IsBoolean()
  is_manual_cost?: boolean; 
  @ApiPropertyOptional({ 
    example: 'FLIGHT', 
    enum: ['DRIVING', 'WALKING', 'PUBLIC_TRANSPORT', 'FLIGHT', 'BOAT'],
    description: 'Chỉ định phương tiện di chuyển đến điểm này' 
  })
  @IsOptional()
  @IsEnum(['DRIVING', 'WALKING', 'PUBLIC_TRANSPORT', 'FLIGHT', 'BOAT'])
  transit_mode?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsNumber()
  transit_duration_minutes?: number;

  @ApiPropertyOptional({ enum: CostType, default: CostType.PER_PERSON,description: 'SHARED: Chia đều, PER_PERSON: Nhân lên'})
  @IsOptional()
  @IsEnum(CostType)
  cost_type?: CostType
    
  @ApiHideProperty()
  @IsOptional()
  @IsNumber()
  transit_distance_km?: number;
}