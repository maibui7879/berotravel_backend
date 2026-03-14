import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray, IsNumber, Min, IsDate} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ForumCategory } from '../entities/forum.entity';
import { Type } from 'class-transformer';
import { UserMinifiedDto } from '../../users/dto/user-minified.dto';

export enum PostSortBy {
  LATEST = 'latest',     // Mới nhất
  POPULAR = 'popular',   // Nhiều Like nhất
  TRENDING = 'trending', // Nhiều bình luận/lượt xem nhất
}

export class PostSearchFilterDto {
  @ApiPropertyOptional({ description: 'Tìm kiếm theo tiêu đề hoặc nội dung' })
  @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional({ enum: ForumCategory })
  @IsOptional() @IsEnum(ForumCategory) category?: ForumCategory;

  @ApiPropertyOptional({ description: 'Lọc bài viết liên quan đến địa điểm cụ thể' })
  @IsOptional() @IsString() place_id?: string;

  @ApiPropertyOptional({ description: 'Xem bài viết của một tác giả cụ thể' })
  @IsOptional() @IsString() author_id?: string;

  @ApiPropertyOptional({ description: 'Lọc theo tag' })
  @IsOptional() @IsString() tag_id?: string;

  @ApiPropertyOptional({ enum: PostSortBy, default: PostSortBy.LATEST })
  @IsOptional() @IsEnum(PostSortBy) sortBy?: PostSortBy = PostSortBy.LATEST;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number) @IsNumber() @Min(1) page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number) @IsNumber() @Min(1) limit?: number = 10;
}

export class CreatePostDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
  @ApiProperty({ enum: ForumCategory }) @IsEnum(ForumCategory) category: ForumCategory;
  @ApiPropertyOptional() @IsArray() @IsOptional() images?: string[];
  @ApiPropertyOptional() @IsArray() @IsOptional() place_ids?: string[];
  @ApiPropertyOptional() @IsString() @IsOptional() journey_id?: string;
}

/**
 * ForumPostResponseDto - Returned with author info embedded
 * Includes author fullName and avatar to reduce FE requests
 */
export class ForumPostResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() content: string;
  @ApiProperty({ type: UserMinifiedDto }) author?: UserMinifiedDto;
  @ApiProperty({ type: [String] }) images: string[];
  @ApiProperty({ enum: ForumCategory }) category: ForumCategory;
  @ApiProperty({ type: [String] }) tag_ids: string[];
  @ApiProperty({ type: [String] }) place_ids: string[];
  @ApiPropertyOptional() journey_id?: string;
  @ApiProperty() stats: { likes: number; views: number; comments: number };
  @ApiProperty() status: string;
  @ApiProperty() is_pinned: boolean;
  @ApiProperty() reports_count: number;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
}

export class CreateCommentDto {
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
  @ApiPropertyOptional() @IsString() @IsOptional() parent_id?: string;
}

/**
 * ForumCommentResponseDto - Returned with author info embedded
 * Includes author fullName and avatar to reduce FE requests
 */
export class ForumCommentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() post_id: string;
  @ApiProperty() content: string;
  @ApiProperty({ type: UserMinifiedDto }) author?: UserMinifiedDto;
  @ApiPropertyOptional() parent_id?: string;
  @ApiProperty() liked_by: string[];
  @ApiProperty() created_at: Date;
}

