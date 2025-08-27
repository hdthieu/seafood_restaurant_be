import { InventoryAction } from "src/common/enums";
import { InventoryItem } from "src/modules/inventoryitems/entities/inventoryitem.entity";
import { User } from "src/modules/user/entities/user.entity";
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('inventory_transactions')
export class InventoryTransaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => InventoryItem)
    item: InventoryItem;

    @Column('decimal')
    quantity: number;

    @Column('enum', { enum: InventoryAction })
    action: InventoryAction;

    @Column()
    note: string;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => User)
    performedBy: User;
}