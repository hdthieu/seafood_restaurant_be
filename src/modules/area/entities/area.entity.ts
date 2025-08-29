import { AreaStatus, TableStatus } from "src/common/enums";
import { RestaurantTable } from "src/modules/restauranttable/entities/restauranttable.entity";
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('areas')
export class Area{
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;              // VD: "Lầu 1", "Sân vườn"

    @Column({ nullable: true })
    note?: string;

    @Column({ type: 'enum', enum: AreaStatus, default: AreaStatus.AVAILABLE })
    status: AreaStatus;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @OneToMany(() => RestaurantTable, (t) => t.area)
    tables: RestaurantTable[];
}
