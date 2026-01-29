import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty } from 'class-validator';
import { FriendStatus } from '../entities/friendship.entity';

export class SendFriendRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  target_user_id: string;
}

export class RespondFriendRequestDto {
  @ApiProperty({ enum: [FriendStatus.ACCEPTED, FriendStatus.BLOCKED] })
  @IsEnum(FriendStatus)
  status: FriendStatus.ACCEPTED | FriendStatus.BLOCKED;
}