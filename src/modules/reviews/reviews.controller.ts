import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { Public } from 'src/common/decorators/public.decorator';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Role } from 'src/common/constants';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CreateReviewDto, ReplyReviewDto } from './dto/review.dto';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // 1. LẤY DANH SÁCH REVIEW (CHO ANDROID UI)
  @Public()
  @Get('place/:placeId')
  @ApiOperation({ summary: 'Lấy review địa điểm (Hỗ trợ Sort: rating, helpful_count, created_at | Filter: POSITIVE, NEGATIVE)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'sort_by', required: false, enum: ['created_at', 'rating', 'helpful_count'] })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filter', required: false, enum: ['ALL', 'POSITIVE', 'NEGATIVE'] })
  findAll(@Param('placeId') placeId: string, @Query() query: any) {
    return this.reviewsService.findAllByPlace(placeId, query);
  }

  // 2. LẤY THỐNG KÊ CHI TIẾT (CHO BIỂU ĐỒ)
  @Public()
  @Get('place/:placeId/stats')
  @ApiOperation({ summary: 'Lấy thống kê sao, tiêu chí sạch sẽ/vị trí... và cảm xúc' })
  getStats(@Param('placeId') placeId: string) {
    return this.reviewsService.getStats(placeId);
  }

  // 3. VIẾT REVIEW MỚI
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gửi đánh giá mới (Tự động cập nhật điểm địa điểm)' })
  create(@Body() dto: CreateReviewDto, @GetCurrentUser('sub') userId: string) {
    return this.reviewsService.create(dto, userId);
  }

  // 4. CHỈNH SỬA (GIỚI HẠN 48H)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sửa đánh giá (Chỉ trong vòng 48h)' })
  update(@Param('id') id: string, @Body() dto: any, @GetCurrentUser('sub') userId: string) {
    return this.reviewsService.update(id, dto, userId);
  }

  // 5. NHẤN HỮU ÍCH
  @Post(':id/helpful')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tăng lượt hữu ích cho review' })
  markHelpful(@Param('id') id: string) {
    // Chuyển sang gọi method trong Service thay vì gọi trực tiếp repo ở controller
    return this.reviewsService.toggleHelpful(id);
  }

  // 6. PHẢN HỒI (CHO CHỦ ĐỊA ĐIỂM)
  @Patch(':id/reply')
  @Roles(Role.MERCHANT, Role.ADMIN)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chủ địa điểm phản hồi khách hàng' })
  reply(@Param('id') id: string, @Body() dto: ReplyReviewDto) {
    return this.reviewsService.reply(id, dto.content);
  }

  // 7. XÓA REVIEW (USER TỰ XÓA HOẶC ADMIN)
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa review (User tự xóa hoặc Admin xóa)' })
  remove(@Param('id') id: string, @GetCurrentUser() user: any) {
    return this.reviewsService.remove(id, user);
  }
}