import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, Min, Max, IsOptional, IsArray, IsBoolean } from 'class-validator';

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

export class ReplyReviewDto {
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
}