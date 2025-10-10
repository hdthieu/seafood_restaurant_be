// src/modules/user/entities/geo-rules.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('geo_rules')
export class GeoRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Toạ độ trung tâm + bán kính
  @Column('double precision')
  centerLat: number;

  @Column('double precision')
  centerLng: number;

  @Column('integer', { default: 150 })
  radiusMeter: number;

  // Các rule phụ trợ
  @Column('text', { array: true, default: '{}' })
  wifiCidrs: string[]; // ví dụ ["192.168.1.0/24", "10.10.0.0/16"]

  @Column('text', { array: true, default: '{}' })
  wifiSsids: string[]; // chỉ để hiển thị

  @Column({ default: true })
  requireWifiWhenOnWifi: boolean; // đang nối Wi-Fi thì bắt buộc IP hợp lệ

  @Column({ default: true })
  requireGps: boolean; // yêu cầu GPS

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
