import { TableStatus } from "src/common/enums";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('tables')
export class RestaurantTable {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;

    @Column({ default: 4 })
    seats: number;

    @Column({ type: 'enum', enum: TableStatus, default: TableStatus.ACTIVE })
    status: TableStatus;

    @Column({ nullable: true })
    note: string; // ghi chú thêm

    @Column()
    area: string; // VD: Lầu 2, Lầu 3...

    @Column({ default: 0 })
    orderCount: number;

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}