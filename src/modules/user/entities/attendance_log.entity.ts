// attendance_log.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('attendance_logs')
export class AttendanceLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') attendanceId: string;
  @Column('uuid') actorId: string;          // ai sửa: admin/nhân viên
  @Column() action: string;                 // CREATE/UPDATE/DELETE
  @Column({ type: 'jsonb' }) diff: any;     // trước/sau
  @CreateDateColumn() createdAt: Date;
}
