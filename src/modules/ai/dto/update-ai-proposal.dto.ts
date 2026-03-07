import { IsOptional, IsNumber, IsString, IsArray, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAiStopDto {
  @ApiProperty({ required: false, description: 'ID của điểm đến' })
  @IsOptional()
  @IsString()
  place_id?: string;

  @ApiProperty({ required: false, description: 'Tên điểm đến' })
  @IsOptional()
  @IsString()
  place_name?: string;

  @ApiProperty({ required: false, description: 'Thời gian kỳ vọng tại điểm (phút)' })
  @IsOptional()
  @IsNumber()
  estimated_duration_minutes?: number;

  @ApiProperty({ required: false, description: 'Giá dự tính (VND)' })
  @IsOptional()
  @IsNumber()
  estimated_cost_vnd?: number;

  @ApiProperty({ required: false, description: 'Thứ tự của stop' })
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiProperty({ required: false, description: 'Lý do chọn điểm này' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false, description: 'Điểm số cuối cùng' })
  @IsOptional()
  @IsNumber()
  final_score?: number;

  @ApiProperty({ required: false, description: 'Vĩ độ' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({ required: false, description: 'Kinh độ' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty({ required: false, description: 'Danh mục' })
  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateAiDayPlanDto {
  @ApiProperty({ required: false, description: 'Số ngày' })
  @IsOptional()
  @IsNumber()
  day_number?: number;

  @ApiProperty({ required: false, description: 'Ngày' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ required: false, description: 'Danh sách các stops' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAiStopDto)
  stops?: UpdateAiStopDto[];

  @ApiProperty({ required: false, description: 'Tổng giá dự tính (VND)' })
  @IsOptional()
  @IsNumber()
  total_estimated_cost_vnd?: number;

  @ApiProperty({ required: false, description: 'Tóm tắt ngày' })
  @IsOptional()
  @IsString()
  summary?: string;
}

export class UpdateAiProposalDto {
  @ApiProperty({ required: false, description: 'Danh sách ngày được cập nhật' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAiDayPlanDto)
  days?: UpdateAiDayPlanDto[];

  @ApiProperty({ required: false, description: 'Tổng ngân sách (VND)' })
  @IsOptional()
  @IsNumber()
  total_budget_vnd?: number;

  @ApiProperty({ required: false, description: 'Mood được sử dụng' })
  @IsOptional()
  @IsString()
  mood_used?: string;

  @ApiProperty({ required: false, description: 'Ghi chú lập kế hoạch' })
  @IsOptional()
  @IsArray()
  planning_notes?: string[];

  @ApiProperty({ required: false, description: 'Cần cập nhật lộ trình (gọi AI service)' })
  @IsOptional()
  needRouteUpdate?: boolean;
}
