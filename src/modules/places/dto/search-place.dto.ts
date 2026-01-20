import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PlaceCategory } from '../../../common/constants';

export enum SortBy {
  RATING = 'rating',
  DISTANCE = 'distance',
  CREATED_AT = 'createdAt'
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export class SearchPlaceDto {
  @ApiPropertyOptional() 
  @IsOptional() 
  @IsString() 
  name?: string;

  @ApiPropertyOptional({ enum: PlaceCategory }) 
  @IsOptional() @IsEnum(PlaceCategory) 
  category?: PlaceCategory;

  @ApiPropertyOptional({ default: 1 }) 
  @IsOptional() @Type(() => Number) 
  @Min(1) 
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 }) 
  @IsOptional() @Type(() => Number) 
  @Min(1) 
  limit?: number = 10;
  
  // Nearby Search & Distance Calculation
  @ApiPropertyOptional() 
  @IsOptional() 
  @Type(() => Number) 
  lng?: number;

  @ApiPropertyOptional() 
  @IsOptional() 
  @Type(() => Number) 
  lat?: number;

  @ApiPropertyOptional({ description: 'Bán kính tối đa (mét)', default: 10000 }) 
  @IsOptional() 
  @Type(() => Number) 
  radius?: number = 10000;

  // Sorting
  @ApiPropertyOptional({ enum: SortBy, default: SortBy.CREATED_AT }) 
  @IsOptional() 
  @IsEnum(SortBy) 
  sortBy?: SortBy = SortBy.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC }) 
  @IsOptional() 
  @IsEnum(SortOrder) 
  sortOrder?: SortOrder = SortOrder.DESC;
}