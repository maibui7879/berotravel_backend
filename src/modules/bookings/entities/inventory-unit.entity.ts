import { Entity, ObjectIdColumn, ObjectId, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('inventory_units')
export class InventoryUnit {
  @ApiProperty({ type: String })
  @ObjectIdColumn()
  _id: ObjectId;

  @ApiProperty({ example: 'place_id_123' })
  @Column()
  place_id: string; // Thêm trường này

  @ApiProperty({ example: 'Deluxe Room' })
  @Column()
  name: string;

  @ApiProperty({ example: 'ROOM', enum: ['ROOM', 'TABLE', 'HOUSE'] })
  @Column()
  unit_type: string; // Thêm trường này (Service đang dùng unit_type)

  @ApiProperty({ example: 2 })
  @Column()
  capacity: number; // Thêm trường này

  @ApiProperty({ example: 10, description: 'Tổng số lượng đơn vị hiện có' })
  @Column()
  total_inventory: number; // Đổi từ total_quantity thành total_inventory để khớp Service

  @ApiProperty({ example: 500000, description: 'Giá mặc định' })
  @Column()
  base_price: number;
}