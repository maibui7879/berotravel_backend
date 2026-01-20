import { Controller, Get, Patch, Body, Delete, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/role.guard';
import { UseGuards } from '@nestjs/common';
import { AtGuard } from 'src/common/guards/at.guard';
import { Role } from 'src/common/constants';

@ApiTags('Users')
@ApiBearerAuth() 
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Lấy thông tin hồ sơ của chính mình' })
  getMe(@GetCurrentUser('sub') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân' })
  updateMe(
    @GetCurrentUser('sub') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(userId, updateUserDto);
  }

  // Endpoint dành cho Admin (Có thể thêm RolesGuard sau)
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