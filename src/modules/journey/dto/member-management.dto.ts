import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class JoinJourneyDto {
  @ApiProperty({ example: 'ABC123', description: 'Mã mời tham gia hành trình' })
  @IsString()
  invite_code: string;
}

export class ManageMemberDto {
  @ApiProperty({ example: 'user123', description: 'ID của thành viên cần quản lý' })
  @IsString()
  member_id: string;
}
