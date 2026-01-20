import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from 'src/common/constants'; // Enum: USER, ADMIN, MERCHANT

export class UpdateRoleDto {
  @ApiProperty({ enum: Role })
  @IsNotEmpty()
  @IsEnum(Role)
  role: Role;
}