import { Controller, Get, Patch, Body, Delete, Param, UseGuards, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';

import { UsersService } from './services/users.service';
import { UserProfileService } from './services/user-profile.service'; // [NEW] Import Service thống kê

import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/role.guard';
import { AtGuard } from '../../common/guards/at.guard';
import { Role } from '../../common/constants';
import { CreateMerchantRequestDto } from './dto/create-merchant-request.dto';

@ApiTags('Users')
@ApiBearerAuth() 
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userProfileService: UserProfileService, // [NEW] Inject Service
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Lấy thông tin hồ sơ của chính mình' })
  getMe(@GetCurrentUser('sub') userId: string) {
    return this.usersService.findById(userId);
  }

  @Get(':id/public-profile')
  @Public()
  @ApiOperation({ summary: 'Xem hồ sơ công khai của người khác (ẩn thông tin nhạy cảm)' })
  async getPublicProfile(@Param('id') id: string) {
    return await this.usersService.getPublicProfile(id);
  }

  // [NEW] Endpoint lấy thống kê (Travel DNA)
  @Get('profile/stats')
  @ApiOperation({ summary: 'Lấy thống kê sở thích cá nhân (Travel DNA)' })
  getMyStats(@GetCurrentUser('sub') userId: string) {
    return this.userProfileService.getInterestVector(userId);
  }

  @Get(':id/travel-dna')
  @Public()
  @ApiOperation({ summary: 'Xem Travel DNA Profile của người dùng khác' })
  async getOtherUserTravelDna(@Param('id') userId: string) {
    return await this.userProfileService.getInterestVector(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân' })
  updateMe(
    @GetCurrentUser('sub') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(userId, updateUserDto);
  }

  // Admin Endpoints
  @Get()
  @ApiOperation({ summary: 'Admin: Danh sách tất cả người dùng' })
  findAll() {
    return this.usersService.findAll();
  }

  @Patch(':id/role')
  @UseGuards(AtGuard, RolesGuard)
  @Roles(Role.ADMIN) 
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin set role cho user (Dev Mode)' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.usersService.updateRole(id, dto.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Admin: Xóa người dùng theo ID' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Post('request-merchant')
  @UseGuards(AtGuard) // Yêu cầu phải đăng nhập
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Gửi yêu cầu nâng cấp tài khoản lên Merchant',
    description: 'Người dùng gửi thông tin kinh doanh để yêu cầu nâng cấp tài khoản thành Merchant. Yêu cầu sẽ được Admin xét duyệt.',
  })
  @ApiBody({
    type: CreateMerchantRequestDto,
    description: 'Thông tin kinh doanh cần cung cấp',
    examples: {
      valid: {
        summary: 'Ví dụ yêu cầu hợp lệ',
        value: {
          business_name: 'BeroTravel - Chuyên Gia Du Lịch',
          tax_code: '0112345678',
          address: '123 Phố Tây Hồ, Quận Tây Hồ, Hà Nội',
          phone_number: '+84912345678',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Yêu cầu được tạo thành công',
    schema: {
      example: {
        id: '507f1f77bcf86cd799439011',
        user_id: '507f1f77bcf86cd799439010',
        business_name: 'BeroTravel - Chuyên Gia Du Lịch',
        tax_code: '0112345678',
        address: '123 Phố Tây Hồ, Quận Tây Hồ, Hà Nội',
        phone_number: '+84912345678',
        status: 'PENDING',
        created_at: '2026-03-10T10:30:00.000Z',
        updated_at: '2026-03-10T10:30:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu đầu vào không hợp lệ',
    schema: {
      example: {
        statusCode: 400,
        message: ['business_name should not be empty', 'tax_code must be a string'],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Người dùng chưa đăng nhập',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Người dùng đã có yêu cầu merchant đang chờ xét duyệt',
    schema: {
      example: {
        statusCode: 409,
        message: 'Bạn đã có yêu cầu nâng cấp Merchant đang chờ xét duyệt',
        error: 'Conflict',
      },
    },
  })
  requestMerchant(
    @GetCurrentUser('sub') userId: string,
    @Body() dto: CreateMerchantRequestDto,
  ) {
    return this.usersService.requestMerchantRole(userId, dto);
  }
}