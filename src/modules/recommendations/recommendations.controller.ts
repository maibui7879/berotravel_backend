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

  @UseGuards(AtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tự động tạo lịch trình (Auto Itinerary)',
    description: 'Tạo lịch trình du lịch tự động dựa trên Travel DNA, số ngày, ngân sách và phong cách du lịch.',
  })
  @ApiBody({ type: AutoItineraryDto })
  @ApiResponse({ 
    status: 201, 
    description: 'Lịch trình được tạo tự động thành công.', 
    type: AutoItineraryResponseDto 
  })
  @Post('itinerary/auto')
  async generateAutoItinerary(
    @GetCurrentUser('sub') userId: string,
    @Body() body: AutoItineraryDto,
  ): Promise<AutoItineraryResponseDto> {
    return await this.itineraryGenerator.generateAutoItinerary(userId, body);
  }

}