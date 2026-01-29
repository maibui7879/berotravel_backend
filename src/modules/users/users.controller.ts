import { Controller, Get, Patch, Body, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { UsersService } from './services/users.service';
import { UserProfileService } from './services/user-profile.service'; // [NEW] Import Service thống kê

import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/role.guard';
import { AtGuard } from 'src/common/guards/at.guard';
import { Role } from 'src/common/constants';

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

  // [NEW] Endpoint lấy thống kê (Travel DNA)
  @Get('profile/stats')
  @ApiOperation({ summary: 'Lấy thống kê sở thích cá nhân (Travel DNA)' })
  getMyStats(@GetCurrentUser('sub') userId: string) {
    return this.userProfileService.getInterestVector(userId);
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
}