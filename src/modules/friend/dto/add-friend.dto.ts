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
  @ApiProperty({ 
    enum: [FriendStatus.ACCEPTED, FriendStatus.REJECTED],
    description: 'Chấp nhận (ACCEPTED) hoặc Từ chối (REJECTED) lời mời kết bạn',
    example: FriendStatus.ACCEPTED 
  })
  @IsEnum({ ACCEPTED: FriendStatus.ACCEPTED, REJECTED: FriendStatus.REJECTED })
  status: FriendStatus.ACCEPTED | FriendStatus.REJECTED;
}