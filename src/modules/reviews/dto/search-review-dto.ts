import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString } from 'class-validator';

export enum ReviewSortBy {
  DATE = 'created_at',
  RATING = 'rating',
  HELPFUL = 'helpful_count',
}

export enum ReviewFilter {
  POSITIVE = 'POSITIVE', // Rating >= 4
  NEGATIVE = 'NEGATIVE', // Rating <= 2
  ALL = 'ALL',
}

export class SearchReviewDto {
  @ApiPropertyOptional({ enum: ReviewSortBy, default: ReviewSortBy.DATE })
  @IsOptional()
  @IsEnum(ReviewSortBy)
  sort_by?: ReviewSortBy = ReviewSortBy.DATE;

  @ApiPropertyOptional({ example: 'DESC', description: 'DESC hoặc ASC' })
  @IsOptional()
  @IsString()
  sort_order?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ enum: ReviewFilter, default: ReviewFilter.ALL })
  @IsOptional()
  @IsEnum(ReviewFilter)
  filter?: ReviewFilter = ReviewFilter.ALL;
}