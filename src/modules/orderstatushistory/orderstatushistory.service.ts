import { Injectable } from '@nestjs/common';
import { CreateOrderstatushistoryDto } from './dto/create-orderstatushistory.dto';
import { UpdateOrderstatushistoryDto } from './dto/update-orderstatushistory.dto';

@Injectable()
export class OrderstatushistoryService {
  create(createOrderstatushistoryDto: CreateOrderstatushistoryDto) {
    return 'This action adds a new orderstatushistory';
  }

  findAll() {
    return `This action returns all orderstatushistory`;
  }

  findOne(id: number) {
    return `This action returns a #${id} orderstatushistory`;
  }

  update(id: number, updateOrderstatushistoryDto: UpdateOrderstatushistoryDto) {
    return `This action updates a #${id} orderstatushistory`;
  }

  remove(id: number) {
    return `This action removes a #${id} orderstatushistory`;
  }
}
