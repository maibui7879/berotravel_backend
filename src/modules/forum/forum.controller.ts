// ../../modules/forum/forum.controller.ts

import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ForumService } from './services/forum.service';
import { CreatePostDto, CreateCommentDto, PostSearchFilterDto, UpdateCommentDto, UpdatePostDto } from './dto/forum.dto';
import { UpdateForumDto } from './dto/update-forum.dto';
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

  @Get('tags')
  @Public()
  @ApiOperation({ summary: 'Lấy danh sách tất cả các hashtag' })
  getAllTags() {
    return this.forumService.getAllTags();
  }

  @Get('tags/:id')
  @Public()
  @ApiOperation({ summary: 'Lấy chi tiết 1 hashtag theo ID' })
  getTagById(@Param('id') id: string) {
    return this.forumService.getTagById(id);
  }
  
  @Post('posts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo bài viết mới' })
  create(@Body() dto: CreatePostDto, @GetCurrentUser('sub') userId: string) {
    return this.forumService.create(dto, userId);
  }

  @Patch('posts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chỉnh sửa bài viết' })
  updatePost(
    @Param('id') id: string, 
    @Body() dto: UpdatePostDto, 
    @GetCurrentUser('sub') userId: string
  ) {
    return this.forumService.updatePost(id, userId, dto);
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

  // ==========================================
  // COMMENT MANAGEMENT APIs
  // ==========================================

  @Patch('comments/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chỉnh sửa nội dung bình luận' })
  updateComment(
    @Param('id') id: string, 
    @Body() dto: UpdateCommentDto, 
    @GetCurrentUser('sub') userId: string
  ) {
    return this.forumService.updateComment(id, userId, dto);
  }

  @Delete('comments/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa bình luận (Tác giả comment/Tác giả bài viết/Admin)' })
  removeComment(
    @Param('id') id: string, 
    @GetCurrentUser('sub') userId: string,
    @GetCurrentUser('role') role: string
  ) {
    return this.forumService.removeComment(id, userId, role === Role.ADMIN);
  }

  @Patch('comments/:id/like')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like/Unlike bình luận' })
  toggleCommentLike(
    @Param('id') id: string, 
    @GetCurrentUser('sub') userId: string
  ) {
    return this.forumService.toggleCommentLike(id, userId);
  }
}