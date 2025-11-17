// src/modules/payroll/entities/payroll.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PayrollStatus } from 'src/common/enums';
import { PayrollSlip } from './payroll-slip.entity';

@Entity('payrolls')
export class Payroll {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;      // BL000001

  @Column()
  name: string;      // "Bảng lương tháng 11/2025"

  @Column({ default: 'MONTHLY' })
  payCycle: string;  // Hàng tháng / Tuần...

  @Column({ type: 'date' })
  workDateFrom: Date;

  @Column({ type: 'date' })
  workDateTo: Date;

  @Column({ type: 'enum', enum: PayrollStatus, default: PayrollStatus.DRAFT })
  status: PayrollStatus;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  totalAmount: string;     // tổng phải trả

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  paidAmount: string;      // đã trả

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  remainingAmount: string; // còn phải trả

  @OneToMany(() => PayrollSlip, (s) => s.payroll)
  slips: PayrollSlip[];


    @Column({ name: 'payroll_id', nullable: true })
  payrollId?: string; 
}
