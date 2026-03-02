import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, IsBoolean, IsEnum } from 'class-validator';
import { CostType } from '../entities/journey.entity';

export class UpdateStopDto {
  @ApiPropertyOptional({ example: '08:00', description: 'Giờ bắt đầu' }) 
  @IsOptional() 
  @IsString()
  start_time?: string;

  @ApiPropertyOptional({ example: '10:00', description: 'Giờ kết thúc' }) 
  @IsOptional() 
  @IsString()
  end_time?: string;

  @ApiPropertyOptional({ description: 'Ghi chú thêm' }) 
  @IsOptional() 
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Chi phí dự kiến' })
  @IsNumber() 
  @IsOptional() 
  estimated_cost?: number;

  @ApiPropertyOptional({ description: 'Đánh dấu nếu tự nhập giá' })
  @IsOptional()
  @IsBoolean()
  is_manual_cost?: boolean; 

  @ApiPropertyOptional({ enum: CostType, description: 'SHARED: Chia đều, PER_PERSON: Nhân lên' })
  @IsOptional()
  @IsEnum(CostType)
  cost_type?: CostType;

  @ApiPropertyOptional({ description: 'Danh sách ID thành viên tham gia trả tiền' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participant_ids?: string[];
  
  @ApiPropertyOptional({ description: 'Đánh dấu nếu điểm này đã được thanh toán trước (Bao phòng)' })
  @IsOptional()
  @IsBoolean()
  is_prepaid?: boolean;

}