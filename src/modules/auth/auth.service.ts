import { Injectable, ForbiddenException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ObjectId } from 'mongodb';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from 'src/common/constants';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: MongoRepository<User>,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async getTokens(userId: string, email: string, role: string) {
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync({ sub: userId, email, role }, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: '1d',
      }),
      this.jwtService.signAsync({ sub: userId, email, role }, {
        secret: this.config.get('RT_SECRET'),
        expiresIn: '7d',
      }),
    ]);
    return { access_token: at, refresh_token: rt };
  }

  async updateRtHash(userId: string, rt: string) {
    const hash = await bcrypt.hash(rt, 10);
    await this.userRepository.update(new ObjectId(userId), { hashedRt: hash });
  }

  async signUp(dto: CreateUserDto) { // Đã thay any bằng DTO
    const exists = await this.userRepository.findOneBy({ email: dto.email });
    if (exists) throw new ConflictException('Email đã tồn tại');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    
    const userEntity = this.userRepository.create({ ...dto, password: hashedPassword, role: Role.USER } as any);
    // Ép kiểu để tránh lỗi User[] của TypeORM
  const user = (await this.userRepository.save(userEntity)) as unknown as User;

    const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
    await this.updateRtHash(user._id.toString(), tokens.refresh_token);
    return tokens;
  }

  async signIn(dto: LoginDto) { // Đã thay any bằng DTO
    const user = (await this.userRepository.findOne({
      where: { email: dto.email },
      select: ['_id', 'email', 'password', 'role'],
    })) as unknown as User;

    if (!user) throw new ForbiddenException('Tài khoản không tồn tại');

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) throw new ForbiddenException('Sai mật khẩu');

    const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
    await this.updateRtHash(user._id.toString(), tokens.refresh_token);
    return tokens;
  }

  async refreshTokens(userId: string, rt: string) {
    const user = (await this.userRepository.findOne({
      where: { _id: new ObjectId(userId) },
      select: ['_id', 'email', 'role', 'hashedRt'],
    })) as unknown as User;

    if (!user || !user.hashedRt) throw new ForbiddenException('Access Denied');

    const rtMatches = await bcrypt.compare(rt, user.hashedRt);
    if (!rtMatches) throw new ForbiddenException('Access Denied');

    const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
    await this.updateRtHash(user._id.toString(), tokens.refresh_token);
    return tokens;
  }

  async logout(userId: string) {
    await this.userRepository.update(new ObjectId(userId), { hashedRt: null });
    return { success: true };
  }
}