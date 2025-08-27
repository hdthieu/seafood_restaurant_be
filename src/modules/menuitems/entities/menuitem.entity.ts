import { MenuCategory } from "src/modules/menucategory/entities/menucategory.entity";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('menu_items')
export class MenuItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column('decimal')
    price: number;

    @Column({ nullable: true })
    description: string;

    @Column({ nullable: true })
    image: string;

    @ManyToOne(() => MenuCategory)
    category: MenuCategory;

    @Column({ default: true })
    isAvailable: boolean;
}
