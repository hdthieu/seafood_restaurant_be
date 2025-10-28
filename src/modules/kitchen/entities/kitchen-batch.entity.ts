// src/modules/kitchen/entities/kitchen-batch.entity.ts
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from 'src/modules/order/entities/order.entity';

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
