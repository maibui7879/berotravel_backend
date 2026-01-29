import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty } from 'class-validator';
import { FavoriteType } from '../entities/favorite.entity';

export class ToggleFavoriteDto {
  @ApiProperty({ description: 'ID của Place hoặc Journey' })
  @IsNotEmpty()
  @IsMongoId()
  target_id: string;

  @ApiProperty({ enum: FavoriteType, description: 'Loại đối tượng muốn like' })
  @IsEnum(FavoriteType)
  type: FavoriteType;
}