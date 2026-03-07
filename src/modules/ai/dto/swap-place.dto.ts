import { IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwapPlaceDto {
  @ApiProperty({ description: 'Chỉ số ngày (0-based)' })
  @IsNumber()
  @IsNotEmpty()
  dayIndex: number;

  @ApiProperty({ description: 'Chỉ số stop trong ngày (0-based)' })
  @IsNumber()
  @IsNotEmpty()
  stopIndex: number;

  @ApiProperty({ description: 'Chỉ số điểm trong candidate_pool (0-based)' })
  @IsNumber()
  @IsNotEmpty()
  candidateIndex: number;
}
