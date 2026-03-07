import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AtGuard } from '../../common/guards/at.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { RequestAiPlanDto } from './dto/request-ai-plan.dto';

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

  @Post('accept/:proposalId')
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept AI proposal and update main journey' })
  async accept(@Param('proposalId') proposalId: string) {
    return await this.aiService.acceptProposal(proposalId);
  }
}