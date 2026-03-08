import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, IsArray, IsDate, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportReason, ReportStatus } from '../entities/forum-report.entity';
import { Type } from 'class-transformer';

export class ReportPostDto {
  @ApiProperty({ enum: ReportReason, description: 'Lý do báo cáo' })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết lý do báo cáo' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class LocationCoordinatesDto {
  @ApiProperty({ description: 'Vĩ độ' })
  @IsNumber()
  latitude: number;

  @ApiProperty({ description: 'Kinh độ' })
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ description: 'Địa chỉ' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Tên địa điểm' })
  @IsOptional()
  @IsString()
  place_name?: string;
}

export class FindBuddyDetailsDto {
  @ApiProperty({ description: 'Ngày khởi hành dự kiến' })
  @Type(() => Date)
  @IsDate()
  travel_date: Date;

  @ApiProperty({ 
    description: 'Ngân sách dự kiến (VND). Ví dụ: "1000000-3000000" hoặc "< 1000000"',
    example: '1000000-3000000'
  })
  @IsString()
  budget_range: string;

  @ApiProperty({ description: 'Số người hiện có trong nhóm' })
  @IsNumber()
  @Min(1)
  current_members: number;

  @ApiProperty({ description: 'Số người cần tìm' })
  @IsNumber()
  @Min(0)
  looking_for_members: number;

  @ApiProperty({ description: 'Tổng số người mong muốn (bao gồm cả hiện có)' })
  @IsNumber()
  @Min(1)
  total_members_needed: number;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết về chuyến đi' })
  @IsOptional()
  @IsString()
  trip_description?: string;
}

export class CreatePostWithDetailsDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
  @ApiProperty({ enum: ['REVIEW', 'EXPERIENCE', 'FIND_BUDDY', 'QNA', 'OTHERS'] }) 
  @IsEnum(['REVIEW', 'EXPERIENCE', 'FIND_BUDDY', 'QNA', 'OTHERS']) category: string;
  
  @ApiPropertyOptional({ isArray: true }) 
  @IsArray() @IsOptional() images?: string[];
  
  @ApiPropertyOptional({ isArray: true }) 
  @IsArray() @IsOptional() place_ids?: string[];
  
  @ApiPropertyOptional() 
  @IsString() @IsOptional() journey_id?: string;

  @ApiPropertyOptional({ description: 'Geo-tagging: Tọa độ và địa chỉ của bài viết' })
  @IsOptional()
  location?: LocationCoordinatesDto;

  @ApiPropertyOptional({ 
    description: 'FIND_BUDDY: Chi tiết tìm bạn đồng hành (Chỉ cần khi category = FIND_BUDDY)'
  })
  @IsOptional()
  find_buddy_details?: FindBuddyDetailsDto;
}
