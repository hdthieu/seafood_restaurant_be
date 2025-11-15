// src/modules/payroll/entities/payroll-slip.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Payroll } from './payroll.entity';
import { User } from '@modules/user/entities/user.entity';
import { PayrollSlipStatus } from 'src/common/enums';

@Entity('payroll_slips')
export class PayrollSlip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // PL000001

  @ManyToOne(() => Payroll, (p) => p.slips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payroll_id' })
  payroll: Payroll;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'staff_id' })
  staff: User;

  // Thông tin tính lương
  @Column('numeric', { precision: 10, scale: 2, default: 0 })
  workingUnits: number;   // hoặc string cũng được, nhưng quan trọng là có default: 0

  @Column('decimal', { precision: 14, scale: 2 })
  basicSalary: string; // lương cơ bản

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  overtimeAmount: string;

  // Bonus / hoa hồng / phụ cấp / giảm trừ – làm sau có thể tách bảng chi tiết
  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  bonusAmount: string;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  commissionAmount: string;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  allowanceAmount: string;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  deductionAmount: string;

  @Column('decimal', { precision: 14, scale: 2 })
  totalAmount: string; // basic + OT + bonus + commission + allowance - deduction

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  paidAmount: string;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  remainingAmount: string;

  @Column({ type: 'enum', enum: PayrollSlipStatus, default: PayrollSlipStatus.DRAFT })
  status: PayrollSlipStatus;
}
