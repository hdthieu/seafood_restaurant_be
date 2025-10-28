// kitchen-batch.entity.ts
import { Entity, PrimaryGeneratedColumn, ManyToOne, Column, CreateDateColumn } from 'typeorm';
import { Order } from '../order/entities/order.entity';
import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { Check } from 'typeorm/decorator/Check';
import { ItemStatus } from '../../common/enums';


@Entity('kitchen_batches')
export class KitchenBatch {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Order, { eager: true })
  order: Order;

  @Column({ length: 128 }) tableName: string;
  @Column({ length: 128 }) staff: string;
  @Column({ default: false }) priority: boolean;

  @Column({ type: 'text', nullable: true }) note?: string | null;

  @CreateDateColumn() createdAt: Date;
}

// kitchen-ticket.entity.ts
@Entity('kitchen_tickets')
export class KitchenTicket {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => KitchenBatch, { eager: true })
  batch: KitchenBatch;

  @ManyToOne(() => Order, { eager: true })
  order: Order;

  @ManyToOne(() => MenuItem, { eager: true })
  menuItem: MenuItem;

  @Check(`"qty" > 0`)
  @Column({ type: 'int' }) qty: number;

  @Column({ type: 'enum', enum: ItemStatus, default: ItemStatus.PENDING })
  status: ItemStatus;

  @CreateDateColumn() createdAt: Date;
}
