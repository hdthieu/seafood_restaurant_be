import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
@Entity('face_snapshots')
export class FaceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  imageUrl: string; // hoặc path relative

  @CreateDateColumn()
  createdAt: Date;
  // 👇 CHỖ QUAN TRỌNG: ép type varchar, nullable được
  @Column({ type: 'varchar', length: 64, nullable: true })
  rekogFaceId: string | null;
}
