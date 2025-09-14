import { Module } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { SupplierController } from './supplier.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { SuppliergroupModule } from '@modules/suppliergroup/suppliergroup.module';
import { SupplierGroup } from '@modules/suppliergroup/entities/suppliergroup.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierGroup])],
  controllers: [SupplierController],
  providers: [SupplierService],
  exports: [SupplierService],
})
export class SupplierModule { }
