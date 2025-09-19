import {
    Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
    ManyToOne, JoinColumn, Index,
    Unique
} from 'typeorm';
import { SupplierStatus } from 'src/common/enums';
import { SupplierGroup } from '@modules/suppliergroup/entities/suppliergroup.entity';

@Entity('suppliers')
@Unique(['code'])
export class Supplier {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    code: string; // Mã NCC

    @Index()
    @Column()
    name: string;

    @Column({ nullable: true })
    company?: string;

    @Column({ nullable: true })
    taxCode?: string;

    @Index()
    @Column({ nullable: true })
    phone?: string;

    @Index()
    @Column({ nullable: true })
    email?: string;

    @Column({ nullable: true })
    address?: string;

    @Column({ nullable: true })
    city?: string;

    @Column({ nullable: true })
    district?: string;

    @Column({ nullable: true })
    ward?: string;

    // FK + Relation tới bảng nhóm
    @Index()
    @Column({ name: 'supplier_group_id', nullable: true })
    supplierGroupId?: string | null;

    @ManyToOne(() => SupplierGroup, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'supplier_group_id' })
    supplierGroup?: SupplierGroup | null;

    @Column({ nullable: true }) note?: string;

    @Column({
        type: 'enum',
        enum: SupplierStatus,
        default: SupplierStatus.ACTIVE,
    })
    status: SupplierStatus;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;
}
