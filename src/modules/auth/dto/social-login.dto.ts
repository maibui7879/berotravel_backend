import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEmail, IsOptional } from 'class-validator';

export class FacebookLoginDto {
  @ApiProperty({ example: 'facebook_access_token', description: 'Facebook access token' })
  @IsNotEmpty()
  @IsString()
  accessToken: string;

  @ApiPropertyOptional({ example: 'user_email@example.com', description: 'Email (optional, provided by Facebook)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Full Name', description: 'Full name (optional, provided by Facebook)' })
  @IsOptional()
  @IsString()
  fullName?: string;
}

export class GoogleLoginDto {
  @ApiProperty({ example: 'google_access_token', description: 'Google access token' })
  @IsNotEmpty()
  @IsString()
  accessToken: string;

  @ApiPropertyOptional({ example: 'user_email@example.com', description: 'Email (optional, provided by Google)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Full Name', description: 'Full name (optional, provided by Google)' })
  @IsOptional()
  @IsString()
  fullName?: string;
}

export class SocialLoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refresh_token: string;

  @ApiProperty({ example: 'facebook' })
  provider: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'Bùi Mai' })
  fullName: string;

  @ApiProperty({ example: true, description: 'True if user is newly created' })
  isNewUser: boolean;
}
