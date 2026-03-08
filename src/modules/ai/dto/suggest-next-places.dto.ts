import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SuggestNextPlacesDto {
  @ApiPropertyOptional({ 
    description: 'ID địa điểm làm mốc gợi ý. Nếu bỏ trống sẽ lấy điểm cuối của Journey.' 
  })
  @IsOptional()
  @IsString()
  seed_place_id?: string;

  @ApiPropertyOptional({ 
    default: 10,
    description: 'Số lượng địa điểm gợi ý tối đa'
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  max_places?: number;
}
