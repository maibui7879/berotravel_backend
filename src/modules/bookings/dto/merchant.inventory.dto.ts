import { ApiProperty } from '@nestjs/swagger';

export class UpdateInventoryQuantityDto {
  @ApiProperty({ example: 5, description: 'Số lượng trống mới' })
  quantity: number;

  @ApiProperty({ example: '2026-01-01' })
  dateFrom: string;

  @ApiProperty({ required: false, example: '2026-01-10' })
  dateTo?: string;

  @ApiProperty({ required: false, example: 'Bảo trì phòng' })
  reason?: string;
}

export class SetPriceDto {
  @ApiProperty()
  unit_id: string;
  
  @ApiProperty({ example: '2026-01-01' })
  date: string;
  
  @ApiProperty({ example: 750000 })
  price_override: number;
}