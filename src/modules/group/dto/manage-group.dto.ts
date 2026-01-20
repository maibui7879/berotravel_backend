import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ManageMemberDto {
  @ApiProperty({ description: 'ID của user cần duyệt, từ chối hoặc kick' })
  @IsNotEmpty()
  @IsString()
  member_id: string;
}