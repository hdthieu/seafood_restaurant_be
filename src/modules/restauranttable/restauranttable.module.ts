import { Module } from '@nestjs/common';
import { RestaurantTablesService } from './restauranttable.service';
import { RestauranttableController } from './restauranttable.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantTable } from './entities/restauranttable.entity';
import { Area } from '../area/entities/area.entity';
import {Invoice} from '../invoice/entities/invoice.entity';
import {Order} from '../order/entities/order.entity';
import {User} from '../user/entities/user.entity';
@Module({
  imports: [TypeOrmModule.forFeature([RestaurantTable, Area, Invoice, Order, User])],
  controllers: [RestauranttableController],
  providers: [RestaurantTablesService],
   exports: [RestaurantTablesService],
})
export class RestauranttableModule {}
