import { Module } from '@nestjs/common';
import { OrderItemsService } from './orderitems.service';
import { OrderItemsController } from './orderitems.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from './entities/orderitem.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { OrderStatusHistory } from '../orderstatushistory/entities/orderstatushistory.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([OrderItem, Order, OrderStatusHistory]), // PHẢI có
  ],
  controllers: [OrderItemsController],
  providers: [OrderItemsService],
  exports: [OrderItemsService,TypeOrmModule],
})
export class OrderitemsModule {}
