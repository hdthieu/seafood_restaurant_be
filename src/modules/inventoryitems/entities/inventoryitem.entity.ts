import { Category } from '@modules/category/entities/category.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
    CreateDateColumn, UpdateDateColumn, Check,
    ManyToMany,
    JoinTable
} from 'typeorm';

@Entity('inventory_items')
@Check(`"quantity" >= 0`)
export class InventoryItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', nullable: true, default: 'DEFAULT_CODE' })
    code: string;

    @Column({ type: 'varchar', nullable: true })
    name: string;

    // Đơn vị BASE để quản lý tồn (vd: gram, ml, lon, ...)
    @ManyToOne(() => UnitsOfMeasure, { nullable: false })
    @JoinColumn({ name: 'base_uom_code', referencedColumnName: 'code' })
    baseUom: UnitsOfMeasure;

    @Column({ type: 'numeric', precision: 12, scale: 3, default: 0 })
    quantity: number;// tồn hiện tại

    @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
    avgCost: number;

    @Column({ type: 'numeric', precision: 12, scale: 3, default: 0 })
    alertThreshold: number;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'category_id' })
    category?: Category;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;

    @ManyToMany(() => Supplier, { cascade: false })
    @JoinTable({ name: 'inventory_item_suppliers' })
    suppliers: Supplier[];

    @Column({ type: 'boolean', default: false })
    isDeleted: boolean;
}
