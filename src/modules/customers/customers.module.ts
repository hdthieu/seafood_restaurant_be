import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customers.entity';
import { Order } from '../order/entities/order.entity';
import { forwardRef } from '@nestjs/common';
import { InvoiceModule } from '../invoice/invoice.module';
@Module({
 imports: [
    TypeOrmModule.forFeature([Customer, Order]),
    forwardRef(() => InvoiceModule), 
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
   exports: [CustomersService, TypeOrmModule],
})
export class CustomersModule {}
