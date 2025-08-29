import { Injectable } from '@nestjs/common';
import { CreateInventorytransactionDto } from './dto/create-inventorytransaction.dto';
import { UpdateInventorytransactionDto } from './dto/update-inventorytransaction.dto';

@Injectable()
export class InventorytransactionService {
  create(createInventorytransactionDto: CreateInventorytransactionDto) {
    return 'This action adds a new inventorytransaction';
  }

  findAll() {
    return `This action returns all inventorytransaction`;
  }

  findOne(id: number) {
    return `This action returns a #${id} inventorytransaction`;
  }

  update(id: number, updateInventorytransactionDto: UpdateInventorytransactionDto) {
    return `This action updates a #${id} inventorytransaction`;
  }

  remove(id: number) {
    return `This action removes a #${id} inventorytransaction`;
  }
}
