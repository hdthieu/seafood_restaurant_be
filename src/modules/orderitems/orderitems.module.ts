import { Module } from '@nestjs/common';
import { OrderItemsService } from './orderitems.service';
import { OrderItemsController } from './orderitems.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from './entities/orderitem.entity';
import { Order } from 'src/modules/order/entities/order.entity';
import { OrderStatusHistory } from '../orderstatushistory/entities/orderstatushistory.entity';
import { forwardRef } from '@nestjs/common';
import { KitchenModule } from '../kitchen/kitchen.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([OrderItem, Order, OrderStatusHistory]), 
       forwardRef(() => KitchenModule), 
  ],
  controllers: [OrderItemsController],
  providers: [OrderItemsService],
  exports: [OrderItemsService,TypeOrmModule],
})
export class OrderitemsModule {}
