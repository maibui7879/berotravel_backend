import { Controller, Get, Post, Body, Param, UseGuards, Delete } from '@nestjs/common';
import { GroupsService } from './group.service';
import { CreateGroupDto, JoinGroupDto } from './dto/group.dto';
import { ManageMemberDto } from './dto/manage-group.dto'; // Import DTO mới
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { AtGuard } from 'src/common/guards/at.guard';

@ApiTags('Groups (Nhóm du lịch)')
@Controller('groups')
@UseGuards(AtGuard)
@ApiBearerAuth()
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post('join')
  @ApiOperation({ summary: 'Tham gia bằng Mã mời (Vào thẳng)' })
  join(@Body() dto: JoinGroupDto, @GetCurrentUser('sub') userId: string) {
    return this.groupsService.join(dto, userId);
  }

  @Post(':id/request')
  @ApiOperation({ summary: 'Gửi yêu cầu tham gia (Chờ duyệt)' })
  requestJoin(@Param('id') id: string, @GetCurrentUser('sub') userId: string) {
    return this.groupsService.requestToJoin(id, userId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Host duyệt thành viên' })
  approve(@Param('id') id: string, @Body() dto: ManageMemberDto, @GetCurrentUser('sub') userId: string) {
    return this.groupsService.approveRequest(id, dto, userId);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Host từ chối yêu cầu' })
  reject(@Param('id') id: string, @Body() dto: ManageMemberDto, @GetCurrentUser('sub') userId: string) {
    return this.groupsService.rejectRequest(id, dto, userId);
  }

  @Post(':id/kick')
  @ApiOperation({ summary: 'Host đuổi thành viên' })
  kick(@Param('id') id: string, @Body() dto: ManageMemberDto, @GetCurrentUser('sub') userId: string) {
    return this.groupsService.kickMember(id, dto, userId);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Thành viên tự rời nhóm' })
  leave(@Param('id') id: string, @GetCurrentUser('sub') userId: string) {
    return this.groupsService.leaveGroup(id, userId);
  }

  @Get('journey/:journeyId')
  @ApiOperation({ summary: 'Tìm nhóm theo Journey ID' })
  findByJourney(@Param('journeyId') journeyId: string, @GetCurrentUser('sub') userId: string) {
    return this.groupsService.findByJourney(journeyId, userId);
  }

  @Get('my-groups')
  @ApiOperation({ summary: 'Lấy danh sách nhóm của tôi' })
  findMyGroups(@GetCurrentUser('sub') userId: string) {
    return this.groupsService.findMyGroups(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết nhóm' })
  findOne(@Param('id') id: string, @GetCurrentUser('sub') userId: string) {
    return this.groupsService.findOne(id, userId);
  }
}