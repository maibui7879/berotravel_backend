import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, IsBoolean, IsEnum } from 'class-validator';
import { CostType } from '../entities/journey.entity';
import { SplitDetailDto } from './tracking.dto';
import { PayerDetailDto } from './tracking.dto';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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

  @ApiPropertyOptional({ enum: CostType, description: 'SHARED: Chia đều, PER_PERSON: Nhân lên, CUSTOM: Tùy chỉnh' })
  @IsOptional()
  @IsEnum(CostType)
  cost_type?: CostType;

  @ApiPropertyOptional({ description: 'Danh sách ID thành viên tham gia (Chia đều)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participant_ids?: string[];
  
  @ApiPropertyOptional({ description: 'Đánh dấu nếu điểm này đã được thanh toán trước (Bao phòng)' })
  @IsOptional()
  @IsBoolean()
  is_prepaid?: boolean;

  // --- [MỚI BỔ SUNG] CÁC TRƯỜNG TÀI CHÍNH N-N ---
@ApiPropertyOptional({ 
    description: 'Số tiền THỰC TẾ của hóa đơn (Chỉ HOST được sửa)',
    example: 500000 
  })
  @IsOptional()
  @IsNumber()
  actual_cost?: number;

  @ApiPropertyOptional({ 
    description: 'Danh sách những người móc ví ra trả cho chủ quán (Tổng amount_paid phải bằng actual_cost). Chỉ HOST được sửa.',
    example: [
      { user_id: "user_A", amount_paid: 200000 }, 
      { user_id: "user_B", amount_paid: 300000 }
    ]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayerDetailDto)
  payers?: PayerDetailDto[];

  @ApiPropertyOptional({ 
    description: 'Danh sách chia nợ theo từng người (BẮT BUỘC khi cost_type = CUSTOM. Tổng amount_owed phải bằng actual_cost). Chỉ HOST được sửa.',
    example: [
      { user_id: "user_A", amount_owed: 100000 }, 
      { user_id: "user_B", amount_owed: 400000 }
    ]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitDetailDto)
  splits?: SplitDetailDto[];
}