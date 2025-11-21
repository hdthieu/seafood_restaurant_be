import { Category } from "src/modules/category/entities/category.entity";
import { Ingredient } from "src/modules/ingredient/entities/ingredient.entity";
import {
    Column,
    Entity,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from "typeorm";
import { MenuComboItem } from "@modules/menucomboitem/entities/menucomboitem.entity";

@Entity('menu_items')
export class MenuItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    // giá món lẻ (giữ nguyên)
    @Column('decimal', { precision: 12, scale: 2 })
    price: number;

    @Column({ nullable: true })
    description: string;

    @Column({ nullable: true })
    image: string;

    @ManyToOne(() => Category, { nullable: true })
    category: Category | null;

    @Column({ default: true })
    isAvailable: boolean;

    // Cho phép trả lại món (ví dụ: bia chai chưa mở, nước uống đóng gói)
    @Column({ default: false })
    isReturnable: boolean;

    // nguyên liệu của món lẻ
    @OneToMany(() => Ingredient, (ingredient) => ingredient.menuItem, { cascade: true })
    ingredients: Ingredient[];

    // ====== Dùng cho combo ======
    @Column({ default: false })
    isCombo: boolean;

    @OneToMany(() => MenuComboItem, (ci) => ci.combo, { cascade: true })
    components?: MenuComboItem[];
}