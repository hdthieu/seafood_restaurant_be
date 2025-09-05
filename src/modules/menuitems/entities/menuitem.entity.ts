import { Category } from "src/modules/category/entities/category.entity";
import { Ingredient } from "src/modules/ingredient/entities/ingredient.entity";
import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";

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

    @ManyToOne(() => Category)
    category: Category;

    @Column({ default: true })
    isAvailable: boolean;

    @OneToMany(() => Ingredient, (ingredient) => ingredient.menuItem, { cascade: true })
    ingredients: Ingredient[];

}
