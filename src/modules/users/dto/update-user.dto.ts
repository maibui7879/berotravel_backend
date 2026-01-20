import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Bùi Mai' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: 'https://link-to-avatar.com/abc.jpg' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: 'https://link-to-cover.com/xyz.jpg' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ example: 'Yêu thích du lịch bụi và ẩm thực đường phố' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @ApiPropertyOptional({ example: '2000-01-01' })
  @IsOptional()
  @IsDateString()
  birthday?: string;

  @ApiPropertyOptional({ example: ['Biển', 'Ẩm thực', 'Chụp ảnh'] })
  @IsOptional()
  @IsArray()
  preferences?: string[];

  @ApiPropertyOptional({ example: 'Adventure' })
  @IsOptional()
  @IsString()
  travelStyle?: string;
}