import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PlacesService } from './places.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { SearchPlaceDto } from './dto/search-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { Role } from 'src/common/constants';
import { Public } from 'src/common/decorators/public.decorator';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AtGuard } from 'src/common/guards/at.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

interface CurrentUser {
  sub: string;
  role: Role;
}

@ApiTags('Places')
@Controller('places')
@UseGuards(AtGuard, RolesGuard)
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Tìm kiếm & Nearby Search' })
  findAll(@Query() query: SearchPlaceDto) {
    return this.placesService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết địa điểm' })
  findOne(@Param('id') id: string) {
    return this.placesService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MERCHANT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo địa điểm mới' })
  create(@Body() dto: CreatePlaceDto, @GetCurrentUser('sub') userId: string) {
    return this.placesService.create(dto, userId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật địa điểm' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlaceDto,
    @GetCurrentUser() user: CurrentUser,
  ) {
    return this.placesService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MERCHANT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa địa điểm' })
  remove(@Param('id') id: string, @GetCurrentUser() user: CurrentUser) {
    return this.placesService.remove(id, user);
  }
}