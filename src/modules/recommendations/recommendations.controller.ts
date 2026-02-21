import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AtGuard } from '../../common/guards/at.guard';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { RecommendationEngineService } from './services/recommendation-engine.service';
import { AutoItineraryGeneratorService } from './services/auto-itinerary-generator.service';
import {
  GetRecommendedPlacesDto,
  AutoItineraryDto,
  RecommendedPlaceDto,
  AutoItineraryResponseDto,
} from './dto/recommendation.dto';

@ApiTags('Recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationEngine: RecommendationEngineService,
    private readonly itineraryGenerator: AutoItineraryGeneratorService,
  ) {}

  /**
   * GET /recommendations/places
   * Lấy danh sách địa điểm gợi ý dựa trên Travel DNA của user
   */
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy danh sách địa điểm gợi ý (Cá nhân hóa)',
    description: 'Trả về các địa điểm phù hợp nhất dựa trên vector sở thích (Travel DNA) và lịch sử tìm kiếm của người dùng.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Danh sách địa điểm gợi ý kèm theo điểm số phù hợp (matching_score).', 
    type: [RecommendedPlaceDto] 
  })
  @Get('places')
  async getRecommendedPlaces(
    @GetCurrentUser('sub') userId: string,
    @Query() query: GetRecommendedPlacesDto,
  ): Promise<{ data: RecommendedPlaceDto[]; total: number }> {
    const places = await this.recommendationEngine.getRecommendedPlaces(userId, query);
    return {
      data: places,
      total: places.length,
    };
  }

  /**
   * POST /recommendations/itinerary/auto-generate
   * Tạo itinerary tự động dựa trên số ngày, budget, và sở thích
   */
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'AI Tạo lịch trình tự động (Auto-Itinerary)',
    description: 'Hệ thống tự động lấp đầy các ngày bằng các địa điểm gợi ý, cân đối thời gian di chuyển và ngân sách.',
  })
  @ApiBody({ type: AutoItineraryDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Lịch trình được tạo thành công.', 
    type: AutoItineraryResponseDto 
  })
  @Post('itinerary/auto-generate')
  async generateAutoItinerary(
    @GetCurrentUser('sub') userId: string,
    @Body() input: AutoItineraryDto,
  ): Promise<AutoItineraryResponseDto> {
    return this.itineraryGenerator.generateAutoItinerary(userId, input);
  }

  /**
   * GET /recommendations/stats
   * Lấy stats về recommendations (optional dashboard info)
   */
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thống kê Travel DNA của người dùng',
    description: 'Trả về dữ liệu thống kê hệ thống đã học được gì từ hành vi của user này.',
  })
  @ApiResponse({ status: 200, description: 'Dữ liệu thống kê sở thích.' })
  @Get('stats')
  async getRecommendationStats(@GetCurrentUser('sub') userId: string) {
    return {
      message: 'Stats endpoint - to be implemented',
      userId,
    };
  }
}