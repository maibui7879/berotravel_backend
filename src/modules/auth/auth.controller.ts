import { 
  Controller, 
  Post, 
  Body, 
  UseGuards, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBearerAuth, 
  ApiBody, 
  ApiResponse 
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { 
  FacebookLoginDto, 
  GoogleLoginDto, 
  SocialLoginResponseDto 
} from './dto/social-login.dto';

// Decorators & Guards
import { Public } from 'src/common/decorators/public.decorator';
import { GetCurrentUser } from 'src/common/decorators/get-current-user.decorator';
import { RtGuard } from 'src/common/guards/rt.guard';

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

  // ==================== TOKEN MGMT ====================

  @Post('logout')
  @ApiBearerAuth() 
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất (Xóa Refresh Token)' })
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