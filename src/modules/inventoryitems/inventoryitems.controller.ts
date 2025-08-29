import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InventoryitemsService } from './inventoryitems.service';
import { CreateInventoryitemDto } from './dto/create-inventoryitem.dto';
import { UpdateInventoryitemDto } from './dto/update-inventoryitem.dto';

@Controller('inventoryitems')
export class InventoryitemsController {
  constructor(private readonly inventoryitemsService: InventoryitemsService) {}

  @Post()
  create(@Body() createInventoryitemDto: CreateInventoryitemDto) {
    return this.inventoryitemsService.create(createInventoryitemDto);
  }

  @Get()
  findAll() {
    return this.inventoryitemsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryitemsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateInventoryitemDto: UpdateInventoryitemDto) {
    return this.inventoryitemsService.update(+id, updateInventoryitemDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inventoryitemsService.remove(+id);
  }
}
