import { Injectable } from '@nestjs/common';
import { CreatePurchasereceiptDto } from './dto/create-purchasereceipt.dto';
import { UpdatePurchasereceiptDto } from './dto/update-purchasereceipt.dto';

@Injectable()
export class PurchasereceiptService {
  create(createPurchasereceiptDto: CreatePurchasereceiptDto) {
    return 'This action adds a new purchasereceipt';
  }

  findAll() {
    return `This action returns all purchasereceipt`;
  }

  findOne(id: number) {
    return `This action returns a #${id} purchasereceipt`;
  }

  update(id: number, updatePurchasereceiptDto: UpdatePurchasereceiptDto) {
    return `This action updates a #${id} purchasereceipt`;
  }

  remove(id: number) {
    return `This action removes a #${id} purchasereceipt`;
  }
}
