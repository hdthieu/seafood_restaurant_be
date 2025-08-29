import { Module } from '@nestjs/common';
import { SeederService } from './seeder.service';
import { SeederController } from './seeder.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from '../inventoryitems/entities/inventoryitem.entity';
import { MenuCategory } from '../menucategory/entities/menucategory.entity';
import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { RestaurantTable } from '../restauranttable/entities/restauranttable.entity';
import { User } from '../user/entities/user.entity';
import { Profile } from '../profile/entities/profile.entity';
import { MenuItemIngredient } from '../menuitemingredient/entities/menuitemingredient.entity';
import { InventoryTransaction } from '../inventorytransaction/entities/inventorytransaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryItem,
      MenuCategory,
      MenuItem,
      RestaurantTable,
      User,
      Profile,
      MenuItemIngredient,
      InventoryTransaction
    ]),
  ],
  controllers: [SeederController],
  providers: [SeederService],
})
export class SeederModule { }
