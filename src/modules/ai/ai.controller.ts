// src/modules/ai/ai.controller.ts
import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { AiService } from './ai.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('ai planning')
@Controller('ai/planning')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('plan/:journeyId')
  @ApiOperation({ summary: 'Yêu cầu AI lập kế hoạch và lưu bản nháp' })
  async createPlan(@Param('journeyId') journeyId: string, @Body() body: any) {
    return this.aiService.generateAndSaveProposal(journeyId, body.requester_user_id, body);
  }

  @Get('proposal/:id')
  @ApiOperation({ summary: 'Lấy chi tiết bản nháp AI cho FE hiển thị' })
  async getProposal(@Param('id') id: string) {
    return this.aiService.getProposalDetails(id);
  }

  @Post('accept/:proposalId')
  @ApiOperation({ summary: 'Chấp nhận bản nháp AI và cập nhật vào hành trình' })
  async accept(@Param('proposalId') proposalId: string) {
    return this.aiService.acceptProposal(proposalId);
  }
}