import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from 'src/common/decorators/public.decorator';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { RtGuard } from 'src/common/guards/rt.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto'; 

@ApiTags('Authentication') 
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công và trả về bộ Token' })
  register(@Body() dto: CreateUserDto) {
    return this.authService.signUp(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập vào hệ thống' })
  @ApiBody({ type: LoginDto }) 
  login(@Body() dto: LoginDto) {
    return this.authService.signIn(dto);
  }

  @Post('logout')
  @ApiBearerAuth() 
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất (Xóa Refresh Token trong DB)' })
  logout(@GetCurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  @Public()
  @UseGuards(RtGuard)
  @Post('refresh')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy Access Token mới bằng Refresh Token' })
  refresh(
    @GetCurrentUser('sub') userId: string,
    @GetCurrentUser('refreshToken') rt: string,
  ) {
    return this.authService.refreshTokens(userId, rt);
  }
}