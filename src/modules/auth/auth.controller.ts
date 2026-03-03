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

// Decorators & Guards
import { Public } from '../../common/decorators/public.decorator';
import { GetCurrentUser } from '../../common/decorators/get-current-user.decorator';
import { RtGuard } from '../../common/guards/rt.guard';

@ApiTags('Authentication') 
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ==================== LOCAL AUTH ====================

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

  // ==================== GOOGLE SOCIAL AUTH ====================

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Bắt đầu luồng đăng nhập Google (Frontend chuyển hướng user tới đây)' })
  googleAuth() {
    // Luồng sẽ do passport-google-oauth20 tự động xử lý
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google Callback (Google trả data về đây)' })
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    // req.user sẽ chứa data mà GoogleStrategy trả về trong hàm `validate`
    const { user } = req;
    
    // Gọi hàm xử lý logic lưu User và sinh Token
    const authData = await this.authService.googleLogin(user);

    // CHUYỂN HƯỚNG VỀ FRONTEND KÈM THEO TOKEN (Tuỳ chỉnh URL cho Frontend của bạn)
    // Ví dụ URL Frontend: http://localhost:3000/auth/success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/success?access_token=${authData.access_token}&refresh_token=${authData.refresh_token}`;
    
    return res.redirect(redirectUrl);
  }

  // ==================== TOKEN MGMT ====================

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
    // Trả về một object JSON để bạn có thể nhìn thấy token trên trình duyệt
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