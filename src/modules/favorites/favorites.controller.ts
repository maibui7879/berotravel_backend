import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { ToggleFavoriteDto } from './dto/favorite.dto';
import { FavoriteType } from './entities/favorite.entity';
import { AtGuard } from 'src/common/guards/at.guard';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';

@ApiTags('Favorites (Yêu thích)')
@Controller('favorites')
@UseGuards(AtGuard)
@ApiBearerAuth()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post('toggle')
  @ApiOperation({ summary: 'Thả tim / Bỏ tim (Place hoặc Journey)' })
  toggle(@Body() dto: ToggleFavoriteDto, @GetCurrentUser('sub') userId: string) {
    return this.favoritesService.toggle(userId, dto);
  }

  @Get('friends')
  @ApiOperation({ summary: 'Xem địa điểm mà bạn bè yêu thích (Social Discovery)' })
  getFriendsFavorites(@GetCurrentUser('sub') userId: string) {
    return this.favoritesService.getFriendsFavoritePlaces(userId);
  }

  @Get()
  @ApiOperation({ summary: 'Xem danh sách bản thân đã yêu thích' })
  @ApiQuery({ name: 'type', enum: FavoriteType })
  getMyFavorites(
    @Query('type') type: FavoriteType,
    @GetCurrentUser('sub') userId: string
  ) {
    return this.favoritesService.getMyFavorites(userId, type);
  }
}