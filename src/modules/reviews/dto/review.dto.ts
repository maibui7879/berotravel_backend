import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, Min, Max, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { UserMinifiedDto } from '../../users/dto/user-minified.dto';

export class CreateReviewDto {
  @ApiProperty() @IsNotEmpty() place_id: string;
  @ApiProperty({ required: false }) @IsOptional() booking_id?: string;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) cleanliness: number;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) service: number;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) location: number;
  @ApiProperty() @IsNumber() @Min(1) @Max(5) price: number;
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsOptional() images?: string[];
  @ApiProperty() @IsBoolean() @IsOptional() is_anonymous?: boolean;
}

export class ReviewResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() place_id: string;
  @ApiProperty({ type: UserMinifiedDto, nullable: true }) user?: UserMinifiedDto;
  @ApiProperty() criteria: { cleanliness: number; service: number; location: number; price: number };
  @ApiProperty() rating: number;
  @ApiProperty() content: string;
  @ApiProperty({ type: [String] }) images: string[];
  @ApiProperty() helpful_count: number;
  @ApiPropertyOptional() merchant_reply?: string;
  @ApiPropertyOptional() merchant_reply_at?: Date;
  @ApiProperty() is_anonymous: boolean;
  @ApiProperty() is_verified: boolean;
  @ApiProperty() status: string;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
}

export class ReplyReviewDto {
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
}