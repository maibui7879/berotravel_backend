import { Controller, Get, Delete, Param, Query, UseGuards, BadRequestException, Post, Body } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SearchChatDto } from './dto/chat.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { AtGuard } from '../../common/guards/at.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants';

@ApiTags('Chat (HTTP API)')
@Controller('chat')
@UseGuards(AtGuard, RolesGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Lấy danh sách các cuộc trò chuyện của User' })
  async getConversations(@GetCurrentUser('sub') userId: string) {
    return this.chatService.getUserConversations(userId);
  }

  @Get('history/:roomId')
  @ApiOperation({ summary: 'Lấy lịch sử tin nhắn trong phòng' })
  async getHistory(@Param('roomId') roomId: string, @GetCurrentUser('sub') userId: string) {
    return this.chatService.getMessages(roomId, userId);
  }

  @Get(':roomId/images')
  @ApiOperation({ summary: 'Lấy kho ảnh của phòng chat' })
  async getImages(@Param('roomId') roomId: string, @GetCurrentUser('sub') userId: string) {
    return this.chatService.getRoomImages(roomId, userId);
  }

  @Get(':roomId/polls')
  @ApiOperation({ summary: 'Lấy danh sách bình chọn' })
  async getPolls(@Param('roomId') roomId: string, @GetCurrentUser('sub') userId: string) {
    return this.chatService.getRoomPolls(roomId, userId);
  }

  @Get(':roomId/search')
  @ApiOperation({ summary: 'Tìm kiếm tin nhắn' })
  async search(
    @Param('roomId') roomId: string,
    @Query() query: SearchChatDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.chatService.searchMessages(roomId, userId, query);
  }

  @Delete(':messageId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin xóa tin nhắn vi phạm' })
  async deleteMessage(@Param('messageId') messageId: string) {
      return this.chatService.deleteMessage(messageId);
  }

  @Post('direct')
  @ApiOperation({ summary: 'Tạo hoặc lấy phòng chat 1-1 với user khác' })
  @ApiBody({
    description: 'Thông tin phòng chat 1-1',
    schema: {
      type: 'object',
      required: ['receiver_id'],
      properties: {
        receiver_id: { type: 'string' }
      }
    }
  })
  async createDirectChat(
    @Body('receiver_id') receiverId: string,
    @GetCurrentUser('sub') userId: string
  ) {
    if (!receiverId) throw new BadRequestException('Vui lòng cung cấp receiver_id');
    return this.chatService.getOrCreateDirectRoom(userId, receiverId);
  }
}