// src/modules/.../entities/attendance.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  JoinColumn, CreateDateColumn, UpdateDateColumn, Unique
} from 'typeorm';
import { AttendanceMethod, AttendanceStatus } from '../../../common/enums';
import { User } from '../../user/entities/user.entity';
import { Shift } from './shift.entity';

export enum CheckType { IN = 'IN', OUT = 'OUT' }
export enum VerifyResult { PASS='PASS', FAIL_GPS='FAIL_GPS', FAIL_WIFI='FAIL_WIFI', FAIL_RULE='FAIL_RULE' }

@Entity('attendances')
@Unique(['userId','dateISO','shiftId'])
export class Attendance {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column('uuid') userId: string;
  @ManyToOne(() => User, { eager: false }) @JoinColumn({ name: 'userId' }) user: User;

  @Column({ type: 'varchar', length: 10 }) dateISO: string; // 'YYYY-MM-DD'

  @Column('uuid') shiftId: string;
  @ManyToOne(() => Shift, { eager: false }) @JoinColumn({ name: 'shiftId' }) shift: Shift;

  @Column({ type: 'varchar', length: 5, nullable: true }) checkIn: string | null;
  @Column({ type: 'varchar', length: 5, nullable: true }) checkOut: string | null;

  @Column({ type: 'enum', enum: AttendanceStatus, default: AttendanceStatus.MISSING })
  status: AttendanceStatus;

  @Column({ type: 'enum', enum: AttendanceMethod, default: AttendanceMethod.MANUAL })
  method: AttendanceMethod;

  @Column({ type: 'text', nullable: true }) note: string | null;

  @Column({ type: 'uuid', nullable: true }) createdBy?: string | null;

  // ----- mobile proof / verification -----
  @Column({ type: 'enum', enum: CheckType, nullable: true })
  checkType?: CheckType;

  @Column({ type: 'enum', enum: VerifyResult, nullable: true })
  verify?: VerifyResult;

  @Column('double precision', { nullable: true }) lat: number | null;
  @Column('double precision', { nullable: true }) lng: number | null;
  @Column('integer',           { nullable: true }) accuracy: number | null;
  @Column('bigint',            { nullable: true }) clientTs: number | null;

  // CHỈNH SỬA Ở ĐÂY: ghi rõ type = 'varchar'
  @Column({ type: 'varchar', length: 16,  nullable: true }) netType?: 'wifi' | 'cellular' | 'unknown';
  @Column({ type: 'varchar', length: 64,  nullable: true }) ssid?: string | null;
  @Column({ type: 'varchar', length: 64,  nullable: true }) bssid?: string | null;
  @Column({ type: 'varchar', length: 64,  nullable: true }) clientIp?: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
