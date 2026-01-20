import { Controller, Get, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SearchChatDto } from './dto/chat.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { AtGuard } from 'src/common/guards/at.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/constants';

@ApiTags('Chat (HTTP API)')
@Controller('chat')
@UseGuards(AtGuard, RolesGuard) // Phân quyền
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // 1. LẤY LỊCH SỬ
  @Get('history/:groupId')
  @ApiOperation({ summary: 'Lấy lịch sử tin nhắn' })
  async getHistory(@Param('groupId') groupId: string, @GetCurrentUser('sub') userId: string) {
    return this.chatService.getMessages(groupId, userId);
  }

  // 2. KHO ẢNH
  @Get(':groupId/images')
  @ApiOperation({ summary: 'Lấy kho ảnh của nhóm' })
  async getImages(@Param('groupId') groupId: string, @GetCurrentUser('sub') userId: string) {
    return this.chatService.getGroupImages(groupId, userId);
  }

  // 3. DANH SÁCH POLLS
  @Get(':groupId/polls')
  @ApiOperation({ summary: 'Lấy danh sách bình chọn' })
  async getPolls(@Param('groupId') groupId: string, @GetCurrentUser('sub') userId: string) {
    return this.chatService.getGroupPolls(groupId, userId);
  }

  // 4. TÌM KIẾM
  @Get(':groupId/search')
  @ApiOperation({ summary: 'Tìm kiếm tin nhắn' })
  async search(
    @Param('groupId') groupId: string,
    @Query() query: SearchChatDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.chatService.searchMessages(groupId, userId, query);
  }

  // 5. ADMIN XÓA TIN NHẮN
  @Delete(':messageId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin xóa tin nhắn vi phạm' })
  async deleteMessage(@Param('messageId') messageId: string) {
      return this.chatService.deleteMessage(messageId);
  }
}