import { ApiProperty } from '@nestjs/swagger';

export class CreateUnitDto {
  @ApiProperty({ example: 'place_123' })
  place_id: string;
  @ApiProperty({ example: 'Deluxe Room' })
  name: string;
  @ApiProperty({ enum: ['ROOM', 'TABLE', 'HOUSE'], example: 'ROOM' })
  type: string;
  @ApiProperty({ example: 10 })
  total_quantity: number;
  @ApiProperty({ example: 1500000 })
  base_price: number;
}

export class UpdateInventoryDto {
  @ApiProperty({ example: 5, description: 'Số lượng thực tế còn trống' })
  quantity: number;
  @ApiProperty({ example: '2026-01-01' })
  dateFrom: string;
  @ApiProperty({ required: false, example: '2026-01-05' })
  dateTo?: string;
  @ApiProperty({ required: false, example: 'Bảo trì định kỳ' })
  reason?: string;
}

export class SetPriceOverrideDto {
  @ApiProperty({ example: 'unit_456' })
  unit_id: string;
  @ApiProperty({ example: '2026-01-01' })
  date: string;
  @ApiProperty({ example: 2000000 })
  price_override: number;
}

export class TogglePromotionDto {
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'ENDED'], example: 'ACTIVE' })
  status: string;
}