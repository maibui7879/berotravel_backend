import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ example: 'place_id_123' })
  place_id: string;

  @ApiProperty({ example: 'unit_id_456' })
  unit_id: string;

  @ApiProperty({ enum: ['ROOM', 'TABLE', 'HOUSE'], example: 'ROOM' })
  booking_type: string;

  @ApiProperty({ example: '2026-01-01T14:00:00.000Z' })
  check_in: Date;

  @ApiProperty({ required: false, example: '2026-01-02T12:00:00.000Z' })
  check_out?: Date;

  @ApiProperty({ example: 2 })
  pax_count: number;

  @ApiProperty({ required: false, example: 'VOUCHER2026' })
  voucher_code?: string;
}