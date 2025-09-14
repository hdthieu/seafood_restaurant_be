// src/modules/customers/entities/customer.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm';
import { CustomerType, Gender } from 'src/common/enums';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true, nullable: true })
  code: string | null;

  @Index()
  @Column({ type: 'enum', enum: CustomerType })
  type: CustomerType;                        // PERSONAL | COMPANY

  @Column({ type: 'varchar', length: 180 })
  name: string;                              // Tên KH / Công ty (tùy type)

  @Column({ type: 'varchar', length: 180, nullable: true })
  companyName: string | null;                // chỉ dùng khi type=COMPANY (optional)

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  email: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ type: 'date', nullable: true })
  birthday: Date | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  province: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  district: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  ward: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  taxNo: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  identityNo: string | null;

  @Column({ type: 'boolean', default: false })
  isWalkin: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
