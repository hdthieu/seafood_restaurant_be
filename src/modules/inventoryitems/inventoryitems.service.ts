import { Injectable } from '@nestjs/common';
import { CreateInventoryitemDto } from './dto/create-inventoryitem.dto';
import { UpdateInventoryitemDto } from './dto/update-inventoryitem.dto';

@Injectable()
export class InventoryitemsService {
  create(createInventoryitemDto: CreateInventoryitemDto) {
    return 'This action adds a new inventoryitem';
  }

  findAll() {
    return `This action returns all inventoryitems`;
  }

  findOne(id: number) {
    return `This action returns a #${id} inventoryitem`;
  }

  update(id: number, updateInventoryitemDto: UpdateInventoryitemDto) {
    return `This action updates a #${id} inventoryitem`;
  }

  remove(id: number) {
    return `This action removes a #${id} inventoryitem`;
  }
}
