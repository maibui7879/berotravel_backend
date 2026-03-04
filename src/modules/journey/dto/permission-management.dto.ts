import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { JourneyMemberRole } from '../entities/journey.entity';

export class TransferHostDto {
  @ApiProperty({ description: 'ID của member sẽ nhận quyền HOST' })
  @IsString()
  new_host_id: string;
}

export class ChangeMemberRoleDto {
  @ApiProperty({ enum: JourneyMemberRole, description: 'Role mới: HOST, MEMBER, hoặc VIEWER' })
  @IsEnum(JourneyMemberRole)
  role: JourneyMemberRole;
}
