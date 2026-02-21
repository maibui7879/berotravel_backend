import { IsNumber, IsString, IsOptional, IsArray, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetRecommendedPlacesDto {
  @ApiPropertyOptional({ description: 'Số lượng kết quả trả về', default: 10, minimum: 1, maximum: 100 })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Số kết quả bỏ qua (Pagination)', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  skip?: number = 0;

  @ApiPropertyOptional({ description: 'Lọc theo danh mục (Ví dụ: HOTEL, CAFE)' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Lọc theo danh sách tags', type: [String], example: ['chill', 'thiên_nhiên'] })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Khoảng cách tối đa (km)', example: 5 })
  @IsNumber()
  @IsOptional()
  maxDistance?: number;

  @ApiPropertyOptional({ description: 'Vĩ độ hiện tại', example: 21.028511 })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Kinh độ hiện tại', example: 105.804817 })
  @IsNumber()
  @IsOptional()
  longitude?: number;
}

export class GoalBasedRecommendationDto {
  @ApiProperty({ description: 'Số ngày của chuyến đi', example: 3 })
  @IsString()
  days: number;

  @ApiPropertyOptional({ description: 'Ngân sách dự kiến', example: 5000000 })
  @IsNumber()
  @IsOptional()
  budget?: number;

  @ApiPropertyOptional({ description: 'Phong cách du lịch', enum: ['budget', 'comfort', 'luxury'] })
  @IsString()
  @IsOptional()
  travelStyle?: 'budget' | 'comfort' | 'luxury';

  @ApiPropertyOptional({ description: 'Nhịp độ di chuyển', enum: ['relaxed', 'moderate', 'fast'] })
  @IsString()
  @IsOptional()
  pace?: 'relaxed' | 'moderate' | 'fast';
}

export class RecommendedPlaceDto {
  @ApiProperty({ example: '65b12c3d4f5e6a7b8c9d0e1f' })
  _id: string;

  @ApiProperty({ example: 'The Coffee House - Hoàn Kiếm' })
  name: string;

  @ApiProperty({ example: 'Quán cafe view đẹp nhìn ra hồ...' })
  description: string;

  @ApiProperty({ type: [String], example: ['CAFE'] })
  category: string[];

  @ApiProperty({ type: [String], example: ['chill', 'làm_việc'] })
  tags: string[];

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  image_url?: string;

  @ApiPropertyOptional({ example: 4.8 })
  average_rating?: number;

  @ApiPropertyOptional({ example: 150 })
  review_count?: number;

  @ApiProperty({ description: 'Điểm phù hợp dựa trên Travel DNA (0-100)', example: 85.5 })
  matching_score: number;

  @ApiProperty({ type: [String], description: 'Các tag khớp với sở thích user', example: ['chill'] })
  matching_tags: string[];

  @ApiPropertyOptional({ description: 'Chi phí ước tính', example: 55000 })
  estimated_cost?: number;

  @ApiPropertyOptional({ description: 'Khoảng cách từ vị trí user (km)', example: 1.2 })
  distance?: number;
}

export class AutoItineraryDto {
  @ApiProperty({ description: 'Số ngày của lịch trình', example: 3 })
  @IsNumber()
  days: number;

  @ApiPropertyOptional({ description: 'Ngân sách tổng (VND)', example: 3000000 })
  @IsNumber()
  @IsOptional()
  budget?: number;

  @ApiPropertyOptional({ description: 'Phong cách du lịch', enum: ['budget', 'comfort', 'luxury'] })
  @IsString()
  @IsOptional()
  travelStyle?: 'budget' | 'comfort' | 'luxury';

  @ApiPropertyOptional({ description: 'Tốc độ di chuyển', enum: ['relaxed', 'moderate', 'fast'] })
  @IsString()
  @IsOptional()
  pace?: 'relaxed' | 'moderate' | 'fast';

  @ApiPropertyOptional({ description: 'Ngày bắt đầu chuyến đi', type: Date, example: '2025-12-25T00:00:00Z' })
  @IsOptional()
  startDate?: Date;
}

export class AutoItineraryResponseDto {
  @ApiPropertyOptional({ description: 'ID của Journey nếu tự động tạo thành công', example: '65b12c3d4f5e...' })
  journey_id?: string;

  @ApiProperty({
    description: 'Danh sách lịch trình từng ngày',
    isArray: true,
    example: [
      {
        day_number: 1,
        stops: [
          {
            place_id: '65b12c...',
            name: 'Phở Bát Đàn',
            category: ['RESTAURANT'],
            estimated_duration: 60,
            estimated_cost: 60000,
            suggested_time: '08:00',
          }
        ],
        total_cost: 60000,
        travel_time: 15,
      }
    ]
  })
  days: Array<any>;

  @ApiProperty({ description: 'Tổng ngân sách dự tính cho chuyến đi', example: 60000 })
  total_budget: number;

  @ApiProperty({ description: 'Tổng quãng đường di chuyển dự tính (km)', example: 12.5 })
  estimated_distance: number;
}