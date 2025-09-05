import { Category } from "src/modules/category/entities/category.entity";
import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
@Entity('inventory_items')
@Check(`"quantity" >= 0`)
export class InventoryItem {
    @PrimaryGeneratedColumn('uuid') id: string;

    @Column() name: string;
    @Column() unit: string;

    @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 }) // mặc định 0
    quantity: number;

    @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
    alertThreshold: number;

    @Column({ nullable: true }) description: string;

    @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'category_id' })
    category?: Category;

    @CreateDateColumn() createdAt: Date;
    @UpdateDateColumn() updatedAt: Date;
}
