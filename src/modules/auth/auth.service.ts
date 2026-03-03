import { 
  Injectable, 
  ForbiddenException, 
  ConflictException, 
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import * as bcrypt from 'bcrypt';

// Entities & Enums
import { User, AuthProvider, SocialProfile } from '../users/entities/user.entity';
import { Role } from '../../common/constants';

// DTOs
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) 
    private readonly userRepository: MongoRepository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  // ==================== AUTH LOGIC ====================

  async signUp(dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    
    const exists = await this.userRepository.findOneBy({ email });
    if (exists) throw new ConflictException('Email đã tồn tại trong hệ thống');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = {
      email,
      password: hashedPassword,
      fullName: dto.fullName,
      role: Role.USER,
      authProviders: [AuthProvider.LOCAL],
      created_at: new Date(),
      updated_at: new Date(),
    };

    const user = await this.userRepository.save(newUser as unknown as User);
    
    return this.generateAuthResponse(user, true);
  }

  async signIn(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    const user = await this.userRepository.findOneBy({ email });

    if (!user) throw new ForbiddenException('Tài khoản không tồn tại');
    
    if (!user.password) {
      throw new ForbiddenException('Tài khoản này được đăng ký qua MXH. Vui lòng đăng nhập bằng Google.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) throw new ForbiddenException('Mật khẩu không chính xác');

    return this.generateAuthResponse(user, false);
  }

  // ===== THÊM LOGIC XỬ LÝ GOOGLE LOGIN =====
  async googleLogin(googleUser: any) {
    if (!googleUser || !googleUser.email) {
      throw new ForbiddenException('Không lấy được thông tin email từ Google');
    }

    const email = googleUser.email.toLowerCase();
    let user = await this.userRepository.findOneBy({ email });
    let isNewUser = false;

    if (!user) {
      // User chưa tồn tại -> Tạo mới (Đăng ký bằng Google)
      isNewUser = true;
      const newUser = {
        email: email,
        fullName: googleUser.displayName || `${googleUser.firstName} ${googleUser.lastName}`.trim(),
        avatar: googleUser.picture,
        role: Role.USER,
        authProviders: [AuthProvider.GOOGLE],
        socialProfile: {
          googleId: googleUser.providerId
        },
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      user = await this.userRepository.save(newUser as unknown as User);
    } else {
      // Nếu user đã tồn tại nhưng chưa có Google AuthProvider -> Cập nhật thêm Provider
      if (!user.authProviders?.includes(AuthProvider.GOOGLE)) {
        user.authProviders = [...(user.authProviders || []), AuthProvider.GOOGLE];
        
        // Khởi tạo socialProfile nếu chưa có
        if (!user.socialProfile) {
          user.socialProfile = { providerId: googleUser.providerId };
        } else {
          user.socialProfile.providerId = googleUser.providerId;
        }
        user.socialProfile.providerId = googleUser.providerId;
        
        // Cập nhật avatar nếu User chưa có ảnh đại diện
        if (!user.avatar && googleUser.picture) {
           user.avatar = googleUser.picture;
        }

        await this.userRepository.save(user);
      }
    }

    // Sinh token và trả về Frontend
    return this.generateAuthResponse(user, isNewUser);
  }

  // ==================== TOKEN MGMT ====================

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

  // ==================== HELPER METHODS ====================

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