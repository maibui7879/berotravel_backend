import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  amenities?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  openingHours?: any;
}