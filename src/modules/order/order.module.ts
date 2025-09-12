import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './order.service';
import { Order } from './entities/order.entity';
import { OrderItem } from '../orderitems/entities/orderitem.entity';
import { OrderStatusHistory } from '../orderstatushistory/entities/orderstatushistory.entity';
import { MenuItem } from '../menuitems/entities/menuitem.entity';
import { Ingredient } from '../ingredient/entities/ingredient.entity';
import { InventoryItem } from '../inventoryitems/entities/inventoryitem.entity';
import { InventoryTransaction } from '../inventorytransaction/entities/inventorytransaction.entity';
import { RestaurantTable } from '../restauranttable/entities/restauranttable.entity';
import { OrdersController } from './order.controller';
import {CustomersModule} from 'src/modules/customers/customers.module'
import { OrderitemsModule } from 'src/modules/orderitems/orderitems.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderStatusHistory,
      MenuItem,
      Ingredient,
      InventoryItem,
      InventoryTransaction,
      RestaurantTable,
    ]),
    CustomersModule,
    OrderitemsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
