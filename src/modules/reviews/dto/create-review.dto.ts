import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, Min, Max, IsOptional, IsArray } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty() @IsNotEmpty() place_id: string;
  @ApiProperty() @IsOptional() booking_id?: string;

  @ApiProperty({ example: 5 }) @IsNumber() @Min(1) @Max(5) cleanliness: number;
  @ApiProperty({ example: 4 }) @IsNumber() @Min(1) @Max(5) service: number;
  @ApiProperty({ example: 5 }) @IsNumber() @Min(1) @Max(5) location: number;
  @ApiProperty({ example: 4 }) @IsNumber() @Min(1) @Max(5) price: number;

  @ApiProperty() @IsString() @IsNotEmpty() content: string;
  @ApiProperty({ required: false }) @IsArray() @IsOptional() images?: string[];
}