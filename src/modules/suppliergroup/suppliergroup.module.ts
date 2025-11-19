import { Module } from '@nestjs/common';
import { SuppliergroupService } from './suppliergroup.service';
import { SuppliergroupController } from './suppliergroup.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplierGroup } from './entities/suppliergroup.entity';
import { SupplierModule } from '@modules/supplier/supplier.module';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { PurchaseReturn } from '@modules/purchasereturn/entities/purchasereturn.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SupplierGroup, Supplier, PurchaseReceipt, PurchaseReturn])],
  controllers: [SuppliergroupController],
  providers: [SuppliergroupService],
  exports: [SuppliergroupService],
})
export class SuppliergroupModule { }
