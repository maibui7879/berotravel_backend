import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional } from 'class-validator';

export enum ReplyStatus {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export class CreateJoinRequestDto {
  @ApiProperty({ example: 'Cho mình xin join với!', required: false })
  @IsOptional()
  @IsString()
  message?: string;
}

export class ReplyJoinRequestDto {
  @ApiProperty({ enum: ReplyStatus, example: 'APPROVED' })
  @IsEnum(ReplyStatus)
  status: ReplyStatus;
}