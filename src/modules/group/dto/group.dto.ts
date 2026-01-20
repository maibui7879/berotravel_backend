import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, Length } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Hội Ế đi Sa Pa' })
  @IsNotEmpty()
  @IsString()
  @Length(3, 50)
  name: string;

  @ApiPropertyOptional({ example: '659b8d2...' })
  @IsOptional()
  @IsString()
  journey_id?: string; // Có thể tạo nhóm từ một hành trình có sẵn
}

export class JoinGroupDto {
  @ApiProperty({ example: 'X92B1Z', description: 'Mã mời 6 ký tự' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  invite_code: string;
}