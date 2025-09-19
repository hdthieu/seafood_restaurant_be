import { Category } from '@modules/category/entities/category.entity';
import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
    CreateDateColumn, UpdateDateColumn, VersionColumn, Check, Unique
} from 'typeorm';

@Entity('inventory_items')
@Check(`"quantity" >= 0`)
// @Unique(['code'])
export class InventoryItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', nullable: true, default: 'DEFAULT_CODE' })
    code: string;

    @Column()
    name: string;

    // Đơn vị BASE để quản lý tồn (vd: gram, ml, bottle)
    @Column()
    unit: string;

    @Column({ type: 'numeric', precision: 12, scale: 3, default: 0 })
    quantity: number;// tồn hiện tại (base unit)

    @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
    avgCost: number;

    @Column({ type: 'numeric', precision: 12, scale: 3, default: 0 })
    alertThreshold: number;

    @Column({ nullable: true })
    description?: string;

    @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'category_id' })
    category?: Category;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;

}
