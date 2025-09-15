import {
    Column, CreateDateColumn, Entity, PrimaryGeneratedColumn,
    UpdateDateColumn, OneToMany, Index
} from 'typeorm';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { SupplierStatus } from 'src/common/enums';

@Entity('supplier_groups')
export class SupplierGroup {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index({ unique: true })
    @Column()
    code: string; // Mã nhóm duy nhất

    @Index({ unique: true })
    @Column()
    name: string; // Tên nhóm duy nhất

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
