import {
    Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
    UpdateDateColumn, OneToMany, Index,
    Unique
} from 'typeorm';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { SupplierStatus } from 'src/common/enums';

@Entity('supplier_groups')
@Unique(['code'])
@Unique(['name'])
export class SupplierGroup {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    code: string;

    @Column()
    name: string;

    @Column({ nullable: true })
    description?: string;

    @Column({
        type: 'enum',
        enum: SupplierStatus,
        default: SupplierStatus.ACTIVE,
    })
    status: SupplierStatus;

    @OneToMany(() => Supplier, (s) => s.supplierGroup)
    suppliers: Supplier[];

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;

    @Column({ type: 'timestamptz', nullable: true })
    deletedAt?: Date | null;
}
