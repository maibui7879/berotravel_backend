import { Body, Controller, Get, Param, Patch, Post, Delete, Query, UseGuards, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Multer } from 'multer';
import { PlacesService } from './places.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { SearchPlaceDto } from './dto/search-place.dto';
import { ClaimPlaceDto } from './dto/claim-place.dto';
import { Role } from '../../common/constants';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AtGuard } from '../../common/guards/at.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';

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
  @ApiConsumes('multipart/form-data') // Khai báo API nhận dữ liệu dạng file
  @ApiOperation({ summary: 'Merchant: Gửi yêu cầu xác nhận chủ sở hữu (cho phép gửi nhiều ảnh/file)' })
  @UseInterceptors(FilesInterceptor('business_proof')) // Tên field trùng với DTO
  async claimPlace(
    @Param('id') id: string,
    @Body() dto: ClaimPlaceDto,
    @UploadedFiles() files: Multer.File[], // Nhận mảng files
    @GetCurrentUser() user: CurrentUser
  ) {
    // Kiểm tra xem người dùng đã cung cấp ít nhất một tệp
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một tệp minh chứng kinh doanh');
    }

    // Chuyển đổi file thành mảng URL/path
    // Lưu ý: Hiện tại chúng ta lưu the tên file thay vì URL thực
    // Sau này bạn có thể thay thế bằng upload lên Cloudinary/S3 để lấy URL thực
    const proofUrls = files.map(f => f.path || f.originalname);

    return this.placesService.requestClaim(id, proofUrls, user);
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