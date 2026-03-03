// src/modules/forum/forum.controller.ts

import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ForumService } from './services/forum.service';
import { CreatePostDto, CreateCommentDto, PostSearchFilterDto } from './dto/forum.dto';
import { AtGuard } from 'src/common/guards/at.guard';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { Role } from 'src/common/constants';

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
  @ApiOperation({ summary: 'Lấy danh sách bài viết (Có lọc & Phân trang)' })
  findAll(@Query() filter: PostSearchFilterDto) {
    return this.forumService.findAll(filter);
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