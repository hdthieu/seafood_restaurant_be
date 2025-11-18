import { Module } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { SupplierController } from './supplier.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { SupplierGroup } from '@modules/suppliergroup/entities/suppliergroup.entity';
import { PurchaseReturn } from '@modules/purchasereturn/entities/purchasereturn.entity';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierGroup, PurchaseReceipt, PurchaseReturn])],
  controllers: [SupplierController],
  providers: [SupplierService],
  exports: [SupplierService],
})
export class SupplierModule { }