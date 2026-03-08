// ../../modules/forum/forum.controller.ts

import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ForumService } from './services/forum.service';
import { CreatePostDto, CreateCommentDto, PostSearchFilterDto } from './dto/forum.dto';
import { ReportPostDto } from './dto/forum-report.dto';
import { AtGuard } from '../../common/guards/at.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '../../common/constants';

@ApiTags('Forum (Diễn đàn & Cộng đồng)')
@Controller('forum')
@UseGuards(AtGuard)
export class ForumController {
  constructor(private readonly forumService: ForumService) {}

  @Post('posts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo bài viết mới' })
  create(@Body() dto: CreatePostDto, @GetCurrentUser('sub') userId: string) {
    return this.forumService.create(dto, userId);
  }

  @Get('posts')
  @Public()
  @ApiOperation({ summary: 'Lấy danh sách bài viết (Có lọc & Phân trang & Thông tin hành trình)' })
  findAll(@Query() filter: PostSearchFilterDto) {
    return this.forumService.findAll(filter);
  }

  @Get('posts/:id')
  @Public()
  @ApiOperation({ summary: 'Lấy chi tiết bài viết (Bao gồm summary hành trình nếu có)' })
  getPostDetail(@Param('id') id: string, @GetCurrentUser('sub') userId?: string) {
    return this.forumService.getPostDetail(id, userId);
  }

  @Patch('posts/:id/like')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like/Unlike bài viết' })
  toggleLike(@Param('id') id: string, @GetCurrentUser('sub') userId: string) {
    return this.forumService.toggleLike(id, userId);
  }

  @Post('posts/:id/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gửi bình luận' })
  addComment(
    @Param('id') id: string, 
    @Body() dto: CreateCommentDto, 
    @GetCurrentUser('sub') userId: string
  ) {
    return this.forumService.addComment(id, dto, userId);
  }

  @Post('posts/:id/report')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Báo cáo bài viết', 
    description: 'Báo cáo vi phạm nội dung (spam, offensive, misinformation, etc.)'
  })
  reportPost(
    @Param('id') id: string,
    @Body() dto: ReportPostDto,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.forumService.reportPost(id, userId, dto);
  }

  @Delete('posts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa bài viết (Tác giả/Admin)' })
  remove(
    @Param('id') id: string, 
    @GetCurrentUser('sub') userId: string,
    @GetCurrentUser('role') role: string
  ) {
    return this.forumService.remove(id, userId, role === Role.ADMIN);
  }
}