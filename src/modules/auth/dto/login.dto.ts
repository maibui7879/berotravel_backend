import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@berotravel.com', description: 'Email của người dùng' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456', description: 'Mật khẩu' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}