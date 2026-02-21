import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
   * 
   * Query params:
   * - limit: số lượng (default 10)
   * - skip: pagination offset (default 0)
   * - category: lọc theo category
   * - tags: lọc theo tags
   * - latitude, longitude, maxDistance: geo search
   */
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get personalized place recommendations',
    description: 'Returns places recommended based on user Travel DNA and interests',
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
   * 
   * Body:
   * - days: số ngày (1-30)
   * - budget: ngân sách tổng (optional)
   * - travelStyle: 'budget' | 'comfort' | 'luxury'
   * - pace: 'relaxed' | 'moderate' | 'fast'
   * 
   * Response: Full itinerary với tất cả details
   */
  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Auto-generate full itinerary',
    description:
      'Generate a complete trip itinerary based on days, budget, and user preferences',
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
  @Get('stats')
  async getRecommendationStats(@GetCurrentUser('sub') userId: string) {
    return {
      message: 'Stats endpoint - to be implemented',
      userId,
    };
  }
}
