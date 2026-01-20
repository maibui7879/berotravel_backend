import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notification.service';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { AtGuard } from 'src/common/guards/at.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(AtGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo' })
  getMyNotifications(@GetCurrentUser('sub') userId: string) {
    return this.notificationsService.getUserNotifications(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo là đã đọc' })
  markAsRead(@Param('id') id: string, @GetCurrentUser('sub') userId: string) {
    return this.notificationsService.markAsRead(id, userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả là đã đọc' })
  markAllAsRead(@GetCurrentUser('sub') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }
}