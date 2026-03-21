import { ApiProperty, PartialType } from '@nestjs/swagger';
import { PromotionStatus } from '../entities/promotion.entity';

export class CreateInventoryUnitDto {
  @ApiProperty({ example: 'place_123' })
  place_id: string;

  @ApiProperty({ example: 'Phòng Deluxe' })
  name: string;

  @ApiProperty({ enum: ['ROOM', 'TABLE', 'HOUSE'], example: 'ROOM' })
  unit_type: string; // Khớp với Entity mới

  @ApiProperty({ example: 2 })
  capacity: number;

  @ApiProperty({ example: 10 })
  total_inventory: number; // Khớp với Entity mới

  @ApiProperty({ example: 1500000 })
  base_price: number;
}

export class UpdatePriceOverrideDto {
  @ApiProperty({ example: 'unit_456' })
  unit_id: string;
  @ApiProperty({ example: '2026-01-01' })
  date: string;
  @ApiProperty({ example: 1800000 })
  price_override: number;
  @ApiProperty({ required: false, example: '18:00' })
  time_slot?: string;
}

export class UpdateInventoryQuantityDto {
  @ApiProperty({ example: 5 })
  quantity: number;
  @ApiProperty({ example: '2026-01-01' })
  dateFrom: string;
  @ApiProperty({ required: false, example: '2026-01-05' })
  dateTo?: string;
  @ApiProperty({ required: false, example: 'Bảo trì định kỳ' })
  reason?: string;
}

export class TogglePromotionDto {
  @ApiProperty({ 
    enum: PromotionStatus, 
    example: PromotionStatus.ACTIVE,
    description: 'Trạng thái mới của chương trình khuyến mãi' 
  })
  status: PromotionStatus; 
}

export class ValidateVoucherDto {
  @ApiProperty({ example: 'place_123' })
  place_id: string;
  @ApiProperty({ example: 1000000 })
  orderValue: number;
}