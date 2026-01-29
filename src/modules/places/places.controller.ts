import { Body, Controller, Get, Param, Patch, Post, Delete, Query, UseGuards } from '@nestjs/common';
import { PlacesService } from './places.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { SearchPlaceDto } from './dto/search-place.dto';
import { Role, PlaceStatus } from 'src/common/constants'; // Import PlaceStatus
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { AtGuard } from 'src/common/guards/at.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
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

  // ================= ADMIN ENDPOINTS (Đặt lên trên cùng để tránh conflict path) =================

  // 1. Lấy danh sách địa điểm MỚI chờ duyệt
  @Get('admin/pending-creations')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ADMIN: Lấy danh sách địa điểm mới chờ duyệt' })
  getPendingPlaces() {
    return this.placesService.getPendingPlaces();
  }

  // 2. Lấy danh sách yêu cầu CHỈNH SỬA chờ duyệt
  @Get('admin/pending-edits')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ADMIN: Lấy danh sách yêu cầu chỉnh sửa chờ duyệt' })
  getPendingEditRequests() {
    return this.placesService.getPendingEditRequests();
  }

  // 3. Duyệt/Từ chối địa điểm MỚI
  @Patch('admin/creations/:id/verify')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ADMIN: Duyệt hoặc Từ chối địa điểm mới' })
  @ApiBody({ schema: { type: 'object', properties: { status: { type: 'string', enum: ['APPROVED', 'REJECTED'] } } } })
  verifyPlace(
    @Param('id') id: string,
    @Body('status') status: PlaceStatus.APPROVED | PlaceStatus.REJECTED,
    @GetCurrentUser() user: CurrentUser
  ) {
    return this.placesService.verifyPlace(id, status, user);
  }

  // 4. Duyệt yêu cầu CHỈNH SỬA
  @Patch('admin/edits/:requestId/approve')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ADMIN: Chấp thuận yêu cầu chỉnh sửa' })
  approveEditRequest(@Param('requestId') requestId: string, @GetCurrentUser() user: CurrentUser) {
    return this.placesService.approveEditRequest(requestId, user);
  }

  // 5. Từ chối yêu cầu CHỈNH SỬA
  @Patch('admin/edits/:requestId/reject')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ADMIN: Từ chối yêu cầu chỉnh sửa' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } } } })
  rejectEditRequest(
    @Param('requestId') requestId: string,
    @Body('reason') reason: string,
    @GetCurrentUser() user: CurrentUser
  ) {
    return this.placesService.rejectEditRequest(requestId, reason, user);
  }

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