import { SupplierStatus } from 'src/common/enums';
import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
@Entity('suppliers')
export class Supplier {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    code: string; // Mã nhà cung cấp

    @Column()
    name: string; // Tên nhà cung cấp

    @Column({ nullable: true })
    company?: string; // Công ty

    @Column({ nullable: true })
    taxCode?: string;

    @Column({ nullable: true })
    phone?: string;

    @Column({ nullable: true })
    email?: string;

    @Column({ nullable: true })
    address?: string; // địa chỉ chi tiết (số nhà, đường)

    @Column({ nullable: true })
    city?: string; // Tỉnh / Thành phố

    @Column({ nullable: true })
    district?: string; // Quận / Huyện

    @Column({ nullable: true })
    ward?: string; // Phường / Xã

    @Column({ nullable: true })
    group?: string; // Nhóm NCC

    @Column({ nullable: true })
    note?: string;

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
