import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Order } from 'src/modules/order/entities/order.entity';

export enum WaiterNotificationType {
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ITEM_CANCELLED = 'ITEM_CANCELLED',
}

@Entity('waiter_notifications')
export class WaiterNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  waiter: User;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  order: Order | null;

  @Column({ type: 'enum', enum: WaiterNotificationType })
  type: WaiterNotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  message?: string | null;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  readAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
