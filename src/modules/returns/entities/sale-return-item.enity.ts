import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { SalesReturn } from './sales-return.entity';
import { OrderItem } from 'src/modules/orderitems/entities/orderitem.entity';
import { MenuItem } from 'src/modules/menuitems/entities/menuitem.entity';

@Entity('sales_return_items')
export class SalesReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SalesReturn, (ret) => ret.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_return_id' })
  return: SalesReturn;

  @ManyToOne(() => OrderItem, { nullable: false, eager: true })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: OrderItem;                // ✅ tên đúng: orderItem, không | null

  @ManyToOne(() => MenuItem, { eager: true })
  @JoinColumn({ name: 'menu_item_id' })
  menuItem: MenuItem;

  @Column('int')
  qty: number;

  @Column('numeric', { precision: 12, scale: 2 })
  unitPrice: number;

  @Column('numeric', { precision: 12, scale: 2 })
  lineAmount: number;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
