import { 
  Controller, 
  Post, 
  Get,
  Body, 
  UseGuards, 
  HttpCode, 
  HttpStatus, 
  Req,
  Res,
  Query
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBearerAuth, 
  ApiBody, 
  ApiResponse 
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';

import { Public } from '../../common/decorators/public.decorator';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { RtGuard } from '../../common/guards/rt.guard';
import { GoogleAuthGuard } from './guards/google.guard';

@ApiTags('Authentication') 
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Đăng ký tài khoản mới bằng Email/Password' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công' })
  register(@Body() dto: CreateUserDto) {
    return this.authService.signUp(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng Email/Password' })
  @ApiBody({ type: LoginDto }) 
  login(@Body() dto: LoginDto) {
    return this.authService.signIn(dto);
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Bắt đầu luồng đăng nhập Google (Frontend chuyển hướng user tới đây)' })
  googleAuth() {
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google Callback (Google trả data về đây)' })
  async googleAuthRedirect(@Req() req) {
    return await this.authService.googleLogin(req.user); 
  }

  @Post('logout')
  @ApiBearerAuth() 
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất (Xóa Refresh Token)' })
  logout(@GetCurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  @Public()
  @Get('success')
  @ApiOperation({ summary: 'Trang hiển thị token sau khi login thành công (Dùng để test)' })
  handleSuccess(
    @Query('access_token') accessToken: string,
    @Query('refresh_token') refreshToken: string,
  ) {
    return {
      message: 'Đăng nhập thành công!',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    };
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