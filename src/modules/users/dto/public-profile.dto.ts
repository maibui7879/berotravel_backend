import { ApiProperty } from '@nestjs/swagger';

export class PublicProfileDto {
  @ApiProperty({ description: 'ID người dùng' })
  id: string;

  @ApiProperty({ description: 'Tên đầy đủ' })
  fullName: string;

  @ApiProperty({ description: 'Avatar URL', nullable: true })
  avatar?: string;

  @ApiProperty({ description: 'Tiểu sử', nullable: true })
  bio?: string;

  @ApiProperty({ description: 'Ảnh bìa', nullable: true })
  coverImage?: string;

  @ApiProperty({ description: 'Phong cách du lịch', nullable: true })
  travelStyle?: string;

  @ApiProperty({ description: 'Vai trò người dùng' })
  role: string;

  @ApiProperty({ description: 'Ngày tạo tài khoản' })
  createdAt: Date;
}
