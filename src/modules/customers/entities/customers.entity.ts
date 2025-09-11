// src/modules/customers/entities/customer.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn
} from 'typeorm';

export enum Gender { MALE = 'MALE', FEMALE = 'FEMALE', OTHER = 'OTHER' }

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true, nullable: true })
code: string | null;
@Column({ type: 'varchar', length: 180 })
name: string;
@Column({ type: 'varchar', length: 20, unique: true, nullable: true })
phone: string | null;
@Column({ type: 'varchar', length: 180, nullable: true })
email: string | null;
@Column({ type: 'varchar', length: 10, nullable: true })
gender: string | null;              // hoặc enum của bạn
@Column({ type: 'date', nullable: true })
birthday: Date | null;
@Column({ type: 'text', nullable: true })
address: string | null;
@Column({ type: 'boolean', default: false })
isWalkin: boolean;


  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
