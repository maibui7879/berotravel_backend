import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FriendsService } from './friend.service';
import { SendFriendRequestDto, RespondFriendRequestDto } from './dto/add-friend.dto';
import { AtGuard } from 'src/common/guards/at.guard';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { FriendStatus } from './entities/friendship.entity';

@ApiTags('Friends (Bạn bè)')
@Controller('friends')
@UseGuards(AtGuard)
@ApiBearerAuth()
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('request')
  @ApiOperation({ summary: 'Gửi lời mời kết bạn' })
  sendRequest(@Body() dto: SendFriendRequestDto, @GetCurrentUser('sub') userId: string) {
    return this.friendsService.sendRequest(userId, dto.target_user_id);
  }

  @Get('requests/received')
  @ApiOperation({ summary: 'Xem lời mời kết bạn đang chờ' })
  getPending(@GetCurrentUser('sub') userId: string) {
    return this.friendsService.getPendingRequests(userId);
  }

  @Patch('requests/:id/respond')
  @ApiOperation({ summary: 'Chấp nhận / Chặn lời mời' })
  respond(
    @Param('id') id: string, 
    @Body() dto: RespondFriendRequestDto, 
    @GetCurrentUser('sub') userId: string
  ) {
    return this.friendsService.respondRequest(userId, id, dto.status);
  }

  @Delete(':targetId')
  @ApiOperation({ summary: 'Hủy kết bạn' })
  unfriend(@Param('targetId') targetId: string, @GetCurrentUser('sub') userId: string) {
    return this.friendsService.unfriend(userId, targetId);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách bạn bè' })
  getMyFriends(@GetCurrentUser('sub') userId: string) {
    return this.friendsService.getMyFriends(userId);
  }
}