import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsBoolean, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PlaceCategory } from '../../../common/constants';

class LocationInput {
  @ApiProperty({ example: 105.8542 }) @IsNumber() lng: number;
  @ApiProperty({ example: 21.0285 }) @IsNumber() lat: number;
}

export class CreatePlaceDto {
  @ApiProperty({ example: 'Khách sạn Continental' }) 
  @IsString() 
  @IsNotEmpty() 
  name: string;

  @ApiProperty() 
  @IsString() 
  description: string;

  @ApiProperty({ enum: PlaceCategory }) 
  @IsEnum(PlaceCategory) 
  category: PlaceCategory;

  @ApiProperty() 
  @IsString() 
  address: string;

  @ApiProperty() 
  @ValidateNested() 
  @Type(() => LocationInput) 
  location: LocationInput;

  @ApiProperty({ example: ['https://image.com/1.jpg'] }) 
  @IsArray() 
  images: string[];

  @ApiProperty({ example: ['wifi', 'hồ bơi'] }) 
  @IsOptional() 
  @IsArray() 
  tags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 3, description: 'Mức độ đông đúc từ 1 đến 5' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  crowdLevel?: number;

  @ApiProperty({ 
    required: false, 
    example: ['Wifi miễn phí', 'Chỗ đậu xe', 'Điều hòa', 'Thanh toán thẻ'],
    description: 'Danh sách các tiện ích/dịch vụ tại địa điểm',
    type: [String]
  })
  @IsOptional()
  @IsArray()
  amenities?: string[];

@ApiProperty({ 
    required: false,
    description: 'Giờ mở cửa chi tiết',
    example: {
      periods: [
        { open: { day: 1, time: '0800' }, close: { day: 1, time: '2200' } },
        { open: { day: 2, time: '0800' }, close: { day: 2, time: '2200' } }
      ],
      weekday_text: [
        'Thứ Hai: 08:00 – 22:00',
        'Thứ Ba: 08:00 – 22:00',
        'Thứ Tư: 08:00 – 22:00'
      ]
    }
  })
  @IsOptional()
  openingHours?: any;
  
  @ApiPropertyOptional({ 
    example: 250000, 
    description: 'Chi phí ước tính trung bình (VNĐ) tại địa điểm' 
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimated_cost_vnd?: number;

  @ApiPropertyOptional({ description: 'Xác nhận là chủ sở hữu địa điểm (Dành cho Merchant)' })
  @IsOptional()
  @IsBoolean()
  is_owner?: boolean;

  
}