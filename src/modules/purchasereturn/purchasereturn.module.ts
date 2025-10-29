import { Module } from '@nestjs/common';
import { PurchasereturnService } from './purchasereturn.service';
import { PurchasereturnController } from './purchasereturn.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseReturnLog } from './entities/purchasereturnlog.entity';
import { PurchaseReturn } from './entities/purchasereturn.entity';
import { CashbookModule } from '@modules/cashbook/cashbook.module';

@Module({
  imports: [TypeOrmModule.forFeature([
    PurchaseReturn,
    PurchaseReturnLog
  ]), CashbookModule],
  controllers: [PurchasereturnController],
  providers: [PurchasereturnService],
})
export class PurchasereturnModule { }
