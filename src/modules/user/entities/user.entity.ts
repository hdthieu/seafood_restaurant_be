
import { UserRole, UserStatus } from "src/common/enums";
import { Profile } from "src/modules/profile/entities/profile.entity";
import { BeforeInsert, Column, CreateDateColumn, Entity, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    email: string;

    @Column({ unique: true, nullable: true })
    phoneNumber: string;

    @Column({ unique: true, nullable: true })
    username: string;

    @Column({ nullable: true })
    password: string;

    @Column('enum', { enum: UserRole, default: UserRole.WAITER })
    role: UserRole;

    @Column({ default: UserStatus.NEW })
    status: UserStatus;

    @Column({ default: true })
    isActive: boolean;

    @Column({ name: 'last_login', nullable: true, type: 'timestamptz' })
    lastLogin: Date;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @Column({ name: 'created_by', nullable: true })
    createdBy?: string;

    @Column({ name: 'updated_by', nullable: true })
    updatedBy?: string;

    @Column({ default: false })
    isDelete: boolean;

    @OneToOne(() => Profile, (profile) => profile.user, {
        cascade: true,
        eager: true,
    })
    profile: Profile;

    @Column({ name: 'refresh_token', nullable: true })
    refreshToken: string;

    @Column({ name: 'refresh_token_expiry', type: 'timestamptz', nullable: true })
    refreshTokenExpiry: Date;
}
