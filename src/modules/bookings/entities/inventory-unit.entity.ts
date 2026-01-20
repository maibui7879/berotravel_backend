import { Entity, ObjectIdColumn, ObjectId, Column } from 'typeorm';

@Entity('inventory_units')
export class InventoryUnit {
  @ObjectIdColumn()
  _id: ObjectId;

  @Column()
  place_id: string;

  @Column({ type: 'string', enum: ['ROOM', 'TABLE', 'HOUSE'] })
  unit_type: string;

  @Column()
  name: string;

  @Column()
  base_price: number;

  @Column()
  capacity: number;

  @Column()
  total_inventory: number;

  @Column('json')
  attributes: {
    has_air_con?: boolean;
    is_smoking_area?: boolean;
    has_kitchen?: boolean;
  };
}