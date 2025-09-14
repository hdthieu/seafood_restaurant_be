import { Module } from '@nestjs/common';
import { SuppliergroupService } from './suppliergroup.service';
import { SuppliergroupController } from './suppliergroup.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplierGroup } from './entities/suppliergroup.entity';
import { SupplierModule } from '@modules/supplier/supplier.module';

@Module({
  imports: [TypeOrmModule.forFeature([SupplierGroup])],
  controllers: [SuppliergroupController],
  providers: [SuppliergroupService],
  exports: [SuppliergroupService],
})
export class SuppliergroupModule { }
