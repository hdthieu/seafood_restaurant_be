// src/modules/shift/entities/shift.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('shifts')
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 5 })
  startTime: string;  // "08:00"

  @Column({ type: 'varchar', length: 5 })
  endTime: string;    // "17:00"

  // ------ KHUNG CHẤM CÔNG (tùy chọn) ------
  // Nếu null sẽ auto-suy ra từ start/end với offset mặc định
  @Column({ type: 'varchar', length: 5, nullable: true })
  checkInOpen?: string | null;   // ví dụ "07:45"

  @Column({ type: 'varchar', length: 5, nullable: true })
  checkInClose?: string | null;  // ví dụ "08:30"

  @Column({ type: 'varchar', length: 5, nullable: true })
  checkOutOpen?: string | null;  // ví dụ "11:30"

  @Column({ type: 'varchar', length: 5, nullable: true })
  checkOutClose?: string | null; // ví dụ "12:30"

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  color?: string; // "#22c55e"

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
