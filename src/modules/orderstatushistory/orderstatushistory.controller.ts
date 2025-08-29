import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OrderstatushistoryService } from './orderstatushistory.service';
import { CreateOrderstatushistoryDto } from './dto/create-orderstatushistory.dto';
import { UpdateOrderstatushistoryDto } from './dto/update-orderstatushistory.dto';

@Controller('orderstatushistory')
export class OrderstatushistoryController {
  constructor(private readonly orderstatushistoryService: OrderstatushistoryService) {}

  @Post()
  create(@Body() createOrderstatushistoryDto: CreateOrderstatushistoryDto) {
    return this.orderstatushistoryService.create(createOrderstatushistoryDto);
  }

  @Get()
  findAll() {
    return this.orderstatushistoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderstatushistoryService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrderstatushistoryDto: UpdateOrderstatushistoryDto) {
    return this.orderstatushistoryService.update(+id, updateOrderstatushistoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orderstatushistoryService.remove(+id);
  }
}
