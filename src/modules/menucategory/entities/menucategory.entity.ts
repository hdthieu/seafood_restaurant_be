import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
@Entity('menu_categories')
export class MenuCategory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string; // VD: Hải sản, Món nướng, Lẩu...

    @Column({ nullable: true })
    description: string;
}
