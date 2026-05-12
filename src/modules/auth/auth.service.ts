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

import { User, AuthProvider, SocialProfile } from '../users/entities/user.entity';
import { Role } from '../../common/constants';

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
    
    const genericErrorMsg = 'Email hoặc mật khẩu không chính xác';

    if (!user) throw new ForbiddenException(genericErrorMsg);
    
    if (!user.password) {
      throw new ForbiddenException(genericErrorMsg);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) throw new ForbiddenException(genericErrorMsg);

    return this.generateAuthResponse(user, false);
  }

  async googleLogin(googleUser: any) {
    const email = (googleUser?.emails?.[0]?.value || googleUser?.email || '').toLowerCase();
    
    if (!email) {
      throw new ForbiddenException('Không lấy được thông tin email từ Google');
    }

    let user = await this.userRepository.findOneBy({ email });
    let isNewUser = false;

    const avatar = googleUser?.photos?.[0]?.value || googleUser?.picture;
    
    const googleId = googleUser?.id || googleUser?.providerId;

    if (!user) {
      isNewUser = true;
      const fullName = googleUser?.displayName || 
                       `${googleUser?.name?.givenName || ''} ${googleUser?.name?.familyName || ''}`.trim() ||
                       email.split('@')[0];
      
      const newUser = {
        email: email,
        fullName: fullName,
        avatar: avatar,
        role: Role.USER,
        authProviders: [AuthProvider.GOOGLE],
        socialProfile: {
          providerId: googleId
        },
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      user = await this.userRepository.save(newUser as unknown as User);
    } else {
      if (!user.authProviders?.includes(AuthProvider.GOOGLE)) {
        user.authProviders = [...(user.authProviders || []), AuthProvider.GOOGLE];

        if (!user.socialProfile) {
          user.socialProfile = { providerId: googleId };
        } else {
          user.socialProfile.providerId = googleId;
        }

        if (!user.avatar && avatar) {
          user.avatar = avatar;
        }

        await this.userRepository.save(user);
      }
    }

    return this.generateAuthResponse(user, isNewUser);
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

  async getTokens(userId: string, email: string, role: string) {
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role },
        { 
          secret: this.config.get<string>('JWT_SECRET'), 
          expiresIn: '7d' 
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role },
        { 
          secret: this.config.get<string>('RT_SECRET'), 
          expiresIn: '30d' 
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