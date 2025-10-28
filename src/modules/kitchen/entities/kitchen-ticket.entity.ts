// src/modules/kitchen/entities/kitchen-ticket.entity.ts
import { Check, Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { KitchenBatch } from './kitchen-batch.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { MenuItem } from 'src/modules/menuitems/entities/menuitem.entity';
import { ItemStatus } from 'src/common/enums';

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
  @Column('int') qty: number;

  @Column({ type: 'enum', enum: ItemStatus, default: ItemStatus.PENDING })
  status: ItemStatus;

  @CreateDateColumn() createdAt: Date;
}
