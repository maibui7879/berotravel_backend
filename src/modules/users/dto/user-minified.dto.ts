import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * UserMinifiedDto - Được nhúng vào các response khác để hiển thị thông tin tác giả/người gửi
 * Giúp giảm số lượng API request và tránh "Layout Thrashing" trên FE
 */
export class UserMinifiedDto {
  @ApiProperty({ description: 'ID người dùng' })
  id: string;

  @ApiProperty({ description: 'Tên đầy đủ' })
  fullName: string;

  @ApiPropertyOptional({ description: 'Avatar URL', nullable: true })
  avatar?: string;
}
