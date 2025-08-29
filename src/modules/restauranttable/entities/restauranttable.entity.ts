import { TableStatus } from "src/common/enums";
import { Area } from "src/modules/area/entities/area.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";
@Unique(['name', 'area'])
@Entity('tables')
export class RestaurantTable {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ default: 4 })
    seats: number;

    @Column({ type: 'enum', enum: TableStatus, default: TableStatus.ACTIVE })
    status: TableStatus;

    @Column({ nullable: true })
    note: string; // ghi chú thêm

    @Column({ default: 0 })
    orderCount: number;

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @ManyToOne(() => Area, (a) => a.tables, { nullable: false, onDelete: 'RESTRICT', eager: true })
    @JoinColumn({ name: 'area_id' })
    area: Area;
}