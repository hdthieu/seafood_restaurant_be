// src/modules/user/entities/net-rules.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn
} from 'typeorm';
import { Branch } from './branch.entity';

@Entity('net_rules')
export class NetRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Quan hệ chi nhánh
 @Column('uuid', { nullable: true })   // <— cho phép null
  branchId: string | null;

  // @ManyToOne(() => Branch, { eager: false })
  // @JoinColumn({ name: 'branchId' })
  // branch: Branch;

  // ----- các trường cấu hình -----
  @Column({ type: 'varchar', length: 128, nullable: true })
  label?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ssid?: string | null;

  // lưu dạng "aa:bb:cc:dd:ee:ff" => 17 ký tự là đủ, để thoải mái để 32
  @Column({ type: 'varchar', length: 32, nullable: true })
  bssid?: string | null;

  // Có thể dùng 'cidr' của Postgres, nhưng an toàn nhất để chuỗi:
  // @Column({ type: 'cidr', nullable: true })  // nếu muốn đúng kiểu PG
  @Column({ type: 'varchar', length: 43, nullable: true }) // "255.255.255.255/32" tối đa 18, IPv6 ~ 43
  cidr?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
