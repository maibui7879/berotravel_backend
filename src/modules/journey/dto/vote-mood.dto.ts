import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { JourneyMood } from '../entities/journey.entity';

export class VoteMoodDto {
  @ApiProperty({ enum: JourneyMood, description: 'Tâm trạng muốn bình chọn' })
  @IsEnum(JourneyMood)
  mood: JourneyMood;
}