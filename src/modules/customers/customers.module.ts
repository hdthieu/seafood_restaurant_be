import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customers.entity';
import { Order } from '../order/entities/order.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Customer, Order])],
  controllers: [CustomersController],
  providers: [CustomersService],
   exports: [CustomersService, TypeOrmModule],
})
export class CustomersModule {}
