import { 
  Injectable, 
  ForbiddenException, 
  ConflictException, 
  BadRequestException 
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import * as bcrypt from 'bcrypt';
import axios from 'axios';

// Entities & Enums
import { User, AuthProvider, SocialProfile } from '../users/entities/user.entity';
import { Role } from 'src/common/constants';

// DTOs
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { 
  GoogleLoginDto, 
  FacebookLoginDto, 
  SocialLoginResponseDto 
} from './dto/social-login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) 
    private readonly userRepository: MongoRepository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  // =================================================================
  // 1. TOKEN MANAGEMENT
  // =================================================================

  async getTokens(userId: string, email: string, role: string) {
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role },
        { 
          secret: this.config.get<string>('JWT_SECRET'), 
          expiresIn: '1d' 
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role },
        { 
          secret: this.config.get<string>('RT_SECRET'), 
          expiresIn: '7d' 
        },
      ),
    ]);
    return { access_token: at, refresh_token: rt };
  }

  async updateRtHash(userId: string, rt: string) {
    const hash = await bcrypt.hash(rt, 10);
    await this.userRepository.update(new ObjectId(userId), { hashedRt: hash });
  }

  // =================================================================
  // 2. LOCAL AUTHENTICATION
  // =================================================================

  async signUp(dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    
    const exists = await this.userRepository.findOneBy({ email });
    if (exists) throw new ConflictException('Email đã tồn tại trong hệ thống');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // [FIX] Tạo object thuần (POJO) thay vì dùng create() để tránh lỗi Overload
    const newUser = {
      email,
      password: hashedPassword,
      fullName: dto.fullName,
      role: Role.USER,
      authProviders: [AuthProvider.LOCAL],
      created_at: new Date(),
      updated_at: new Date(),
    };

    // [FIX] Ép kiểu 'as User' để TypeORM hiểu
    const user = await this.userRepository.save(newUser as unknown as User);
    
    return this.generateAuthResponse(user, true);
  }

  async signIn(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    const user = await this.userRepository.findOneBy({ email });

    if (!user) throw new ForbiddenException('Tài khoản không tồn tại');
    
    // Check password existence (Social account check)
    if (!user.password) {
      throw new ForbiddenException('Tài khoản này được đăng ký qua MXH. Vui lòng đăng nhập bằng Google/Facebook.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) throw new ForbiddenException('Mật khẩu không chính xác');

    return this.generateAuthResponse(user, false);
  }

  async logout(userId: string) {
    await this.userRepository.update(new ObjectId(userId), { hashedRt: null });
    return { success: true };
  }

  async refreshTokens(userId: string, rt: string) {
    const user = await this.userRepository.findOneBy({ _id: new ObjectId(userId) });
    if (!user || !user.hashedRt) throw new ForbiddenException('Access Denied');

    const rtMatches = await bcrypt.compare(rt, user.hashedRt);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
    await this.updateRtHash(user._id.toString(), tokens.refresh_token);
    
    return tokens;
  }

  // =================================================================
  // 3. SOCIAL AUTHENTICATION
  // =================================================================

  async googleLogin(dto: GoogleLoginDto): Promise<SocialLoginResponseDto> {
    try {
      const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${dto.accessToken}` },
      });
      return this.handleSocialLogin(response.data, AuthProvider.GOOGLE);
    } catch (error) {
      throw new BadRequestException('Google Token không hợp lệ hoặc đã hết hạn');
    }
  }

  async facebookLogin(dto: FacebookLoginDto): Promise<SocialLoginResponseDto> {
    try {
      const response = await axios.get('https://graph.facebook.com/me', {
        params: {
          fields: 'id,email,name,picture',
          access_token: dto.accessToken,
        },
      });
      return this.handleSocialLogin(response.data, AuthProvider.FACEBOOK);
    } catch (error) {
      throw new BadRequestException('Facebook Token không hợp lệ hoặc đã hết hạn');
    }
  }

  private async handleSocialLogin(profile: any, provider: AuthProvider): Promise<SocialLoginResponseDto> {
    const email = profile.email?.toLowerCase();
    
    if (!email) {
      throw new BadRequestException(`Không thể lấy Email từ tài khoản ${provider}.`);
    }

    let user = await this.userRepository.findOneBy({ email });
    let isNewUser = false;

    const socialProfile: SocialProfile = {
      providerId: profile.id,
      email: email,
      displayName: profile.name || profile.displayName,
      picture: profile.picture?.data?.url || profile.picture,
    };

    if (user) {
      // --- UPDATE EXISTING USER ---
      if (!user.authProviders.includes(provider)) {
        user.authProviders.push(provider);
      }
      
      user.socialProfiles = {
        ...(user.socialProfiles || {}),
        [provider]: socialProfile
      };

      if (!user.avatar && socialProfile.picture) {
        user.avatar = socialProfile.picture;
      }

      await this.userRepository.save(user);
    } else {
      // --- CREATE NEW SOCIAL USER ---
      isNewUser = true;
      
      // [FIX] Tạo POJO để tránh lỗi type 'null' vs 'undefined' của password
      const newUser = {
        email,
        fullName: socialProfile.displayName || email.split('@')[0],
        role: Role.USER,
        authProviders: [provider],
        socialProfiles: { [provider]: socialProfile },
        avatar: socialProfile.picture,
        password: undefined, // [FIX] Dùng undefined cho optional field
        created_at: new Date(),
        updated_at: new Date(),
      };

      // [FIX] Ép kiểu as User
      user = await this.userRepository.save(newUser as unknown as User);
    }

    const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
    await this.updateRtHash(user._id.toString(), tokens.refresh_token);

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      provider,
      email: user.email,
      fullName: user.fullName,
      isNewUser,
    };
  }

  private async generateAuthResponse(user: User, isNewUser: boolean) {
    const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
    await this.updateRtHash(user._id.toString(), tokens.refresh_token);
    return {
      ...tokens,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isNewUser,
    };
  }
}