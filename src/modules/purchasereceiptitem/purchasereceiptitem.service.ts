import { Injectable } from '@nestjs/common';
import { CreatePurchasereceiptitemDto } from './dto/create-purchasereceiptitem.dto';
import { UpdatePurchasereceiptitemDto } from './dto/update-purchasereceiptitem.dto';

@Injectable()
export class PurchasereceiptitemService {
  create(createPurchasereceiptitemDto: CreatePurchasereceiptitemDto) {
    return 'This action adds a new purchasereceiptitem';
  }

  findAll() {
    return `This action returns all purchasereceiptitem`;
  }

  findOne(id: number) {
    return `This action returns a #${id} purchasereceiptitem`;
  }

  update(id: number, updatePurchasereceiptitemDto: UpdatePurchasereceiptitemDto) {
    return `This action updates a #${id} purchasereceiptitem`;
  }

  remove(id: number) {
    return `This action removes a #${id} purchasereceiptitem`;
  }
}
