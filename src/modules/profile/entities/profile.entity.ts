import { Country } from "src/common/enums";
import { User } from "src/modules/user/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('profiles')
export class Profile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'full_name', length: 150 })
    fullName: string;

    @Column({ nullable: true, type: 'timestamptz' })
    dob: Date;

    @Column({ nullable: true, length: 250 })
    avatar: string;

    @Column({ nullable: true, length: 500 })
    description: string;

    @Column({ nullable: true, length: 250 })
    address: string;

    @Column({ nullable: true })
    city: string;

    @Column({ default: Country.VietNam })
    country: Country;

    @Column('text', { nullable: true })
    addressList: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @Column({ name: 'created_by', nullable: true })
    createdBy: string;

    @Column({ name: 'updated_by', nullable: true })
    updatedBy: string;

    @OneToOne(() => User, (user) => user.profile, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;
}