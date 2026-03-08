import { Body, Controller, Get, Param, Patch, Post, Delete, Query, UseGuards } from '@nestjs/common';
import { PlacesService } from './places.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { SearchPlaceDto } from './dto/search-place.dto';
import { Role } from '../../common/constants';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AtGuard } from '../../common/guards/at.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

interface CurrentUser {
  sub: string;
  role: Role;
}

@ApiTags('Places')
@Controller('places')
@UseGuards(AtGuard, RolesGuard)
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  // ================= PUBLIC / USER ENDPOINTS =================

  @Public()
  @Get()
  @ApiOperation({ summary: 'Tìm kiếm & Nearby Search' })
  findAll(@Query() query: SearchPlaceDto, @GetCurrentUser() user?: CurrentUser) {
    return this.placesService.findAll(query, user?.sub);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết địa điểm' })
  findOne(@Param('id') id: string, @GetCurrentUser() user?: CurrentUser) {
    return this.placesService.findOne(id, user?.sub);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo địa điểm mới (User thường -> Pending)' })
  create(@Body() dto: CreatePlaceDto, @GetCurrentUser() user: CurrentUser) {
    return this.placesService.create(dto, user);
  }

  // Merchant claim ownership của địa điểm
  @Post(':id/claim')
  @Roles(Role.MERCHANT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merchant: Gửi yêu cầu xác nhận chủ sở hữu địa điểm' })
  @ApiBody({ schema: { type: 'object', properties: { business_proof: { type: 'array', items: { type: 'string' } } } } })
  claimPlace(
    @Param('id') id: string,
    @Body('business_proof') proof: string[],
    @GetCurrentUser() user: CurrentUser
  ) {
    return this.placesService.requestClaim(id, proof, user);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật địa điểm (User thường -> Tạo Request duyệt)' })
  update(@Param('id') id: string, @Body() dto: UpdatePlaceDto, @GetCurrentUser() user: CurrentUser) {
    return this.placesService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa địa điểm' })
  remove(@Param('id') id: string, @GetCurrentUser() user: CurrentUser) {
    return this.placesService.remove(id, user);
  }
}