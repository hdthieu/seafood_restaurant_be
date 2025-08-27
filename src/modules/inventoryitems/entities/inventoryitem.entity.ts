import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('inventory_items')
export class InventoryItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    unit: string; // kg, lít, chai...

    @Column('decimal')
    quantity: number;

    @Column('decimal')
    alertThreshold: number; // Ngưỡng cảnh báo sắp hết

    @Column({ nullable: true })
    description: string;

    @UpdateDateColumn()
    updatedAt: Date;
}