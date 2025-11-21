// src/modules/face/entities/face-sample.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('face_samples')
export class FaceSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string; // FK tới users.id

  @Column()
  rekogFaceId: string; // FaceId trong AWS Rekognition

  @Column({ nullable: true })
  imageUrl?: string; // nếu bạn lưu file ở S3 / disk

  @Column({ type: 'float', nullable: true })
  confidence?: number;

  @CreateDateColumn()
  createdAt: Date;
}
