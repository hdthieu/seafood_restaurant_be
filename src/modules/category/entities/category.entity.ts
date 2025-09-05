import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string; // VD: Hải sản, Món nướng, Lẩu...

    @Column({ nullable: true })
    description: string;
}