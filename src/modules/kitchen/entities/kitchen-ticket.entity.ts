// src/modules/kitchen/entities/kitchen-ticket.entity.ts
import { Check, Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { KitchenBatch } from './kitchen-batch.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { MenuItem } from 'src/modules/menuitems/entities/menuitem.entity';
import { ItemStatus } from 'src/common/enums';
import { DeleteDateColumn } from 'typeorm';

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
  //  thêm: map tới orderItemId (ROW-LEVEL) để FE xoá đúng card
 
   @Column({ name: 'order_item_id', type: 'uuid', nullable: true })
  orderItemId?: string | null;
  @CreateDateColumn() createdAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
cancelReason?: string | null;
@Column({ type: 'timestamptz', nullable: true }) cancelledAt?: Date;
@Column({ type: 'varchar', length: 120, nullable: true })
cancelledBy?: string | null;
 @Column({ type: 'uuid', nullable: true })
  batchId?: string;

  @Column({ default: false })
cancelled: boolean;
@DeleteDateColumn({ name: 'deleted_at', nullable: true })
deletedAt?: Date | null;

 @Column({ type: 'text', nullable: true })
  note?: string | null;
}
