import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsArray, IsDateString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'admin@berotravel.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '12345678' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Bùi Mai' })
  @IsNotEmpty()
  fullName: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: ['chill', 'view_hồ', 'làm_việc'] })
  @IsArray()
  @IsString({ each: true }) // Kiểm tra từng phần tử trong mảng là string
  @IsOptional()
  tags?: string[];
  
  @ApiPropertyOptional({ example: ['Biển', 'Ẩm thực'] })
  @IsOptional()
  @IsArray()
  preferences?: string[];

  @ApiPropertyOptional({ example: '2000-01-01' })
  @IsOptional()
  @IsDateString()
  birthday?: string;
}