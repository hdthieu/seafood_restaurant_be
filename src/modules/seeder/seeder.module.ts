import { Module } from '@nestjs/common';
import { SeederService } from './seeder.service';
import { SeederController } from './seeder.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from '../inventoryitems/entities/inventoryitem.entity';
import { Category } from '../category/entities/category.entity';
import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { RestaurantTable } from '../restauranttable/entities/restauranttable.entity';
import { User } from '../user/entities/user.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { InventoryTransaction } from '../inventorytransaction/entities/inventorytransaction.entity';
import { Area } from '../area/entities/area.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryItem,
      Category,
      MenuItem,
      RestaurantTable,
      User,
      Profile,
      Ingredient,
      InventoryTransaction,
      Area
    ]),
  ],
  controllers: [SeederController],
  providers: [SeederService],
})
export class SeederModule { }
