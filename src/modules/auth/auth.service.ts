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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) 
    private readonly userRepository: MongoRepository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}


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