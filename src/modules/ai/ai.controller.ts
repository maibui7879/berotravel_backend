import { Controller, Post, Get, Body, Param, UseGuards, Delete, Patch, ParseIntPipe } from '@nestjs/common';
import { AiService } from './ai.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AtGuard } from '../../common/guards/at.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { RequestAiPlanDto } from './dto/request-ai-plan.dto';
import { UpdateAiProposalDto } from './dto/update-ai-proposal.dto';

@ApiTags('AI Planning')
@Controller('ai/planning')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('plan/:journeyId')
  @UseGuards(AtGuard) 
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yêu cầu AI lập kế hoạch hành trình (Lấy ID từ Token)' })
  async createPlan(
    @Param('journeyId') journeyId: string, 
    @GetCurrentUser('sub') userId: string, 
    @Body() dto: RequestAiPlanDto,
  ) {
    return this.aiService.generateAndSaveProposal(journeyId, userId, dto);
  }

  @Get('proposal/:id')
  @ApiOperation({ summary: 'Get full draft details for FE display' })
  async getProposal(@Param('id') id: string) {
    return await this.aiService.getProposalDetails(id);
  }

  @Get('proposals/journey/:journeyId')
  @ApiOperation({ summary: 'Lấy danh sách tất cả các bản nháp của một hành trình cụ thể (Lịch sử)' })
  async getProposalsByJourney(@Param('journeyId') journeyId: string) {
    return await this.aiService.getProposalsByJourney(journeyId);
  }

  @Patch('proposal/:id')
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thay đổi nhỏ trong bản nháp AI (tinh chỉnh)' })
  async updateProposal(
    @Param('id') id: string,
    @Body() updateData: UpdateAiProposalDto,
  ) {
    return await this.aiService.updateProposal(id, updateData);
  }

  @Get('explain/:journeyId')
  @ApiOperation({ summary: 'Lấy giải thích thuật toán chọn điểm của AI' })
  async explain(@Param('journeyId') journeyId: string) {
    return await this.aiService.getAiExplanation(journeyId);
  }

  @Post('optimize/:journeyId/:dayNumber')
  @ApiOperation({ summary: 'Tối ưu lại đường đi ngắn nhất cho 1 ngày' })
  async optimizeDay(
    @Param('journeyId') journeyId: string,
    @Param('dayNumber', ParseIntPipe) dayNumber: number
  ) {
    return await this.aiService.optimizeDayRoute(journeyId, dayNumber);
  }

  @Patch('proposal/:proposalId/swap')
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đổi một điểm trong nháp lấy điểm dự phòng' })
  async swapPlace(
    @Param('proposalId') proposalId: string,
    @Body() body: { dayNumber: number; oldPlaceId: string; newPlaceId: string }
  ) {
    return await this.aiService.swapPlaceInProposal(
      proposalId, body.dayNumber, body.oldPlaceId, body.newPlaceId
    );
  }

  @Post('accept/:proposalId')
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept AI proposal and update main journey' })
  async accept(@Param('proposalId') proposalId: string) {
    return await this.aiService.acceptProposal(proposalId);
  }

  @Delete('proposal/:id')
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa thủ công một bản nháp AI' })
  async deleteProposal(@Param('id') id: string) {
    return await this.aiService.deleteProposal(id);
  }
}