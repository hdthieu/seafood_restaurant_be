import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InventorytransactionService } from './inventorytransaction.service';
import { CreateInventorytransactionDto } from './dto/create-inventorytransaction.dto';
import { UpdateInventorytransactionDto } from './dto/update-inventorytransaction.dto';

@Controller('inventorytransaction')
export class InventorytransactionController {
  constructor(private readonly inventorytransactionService: InventorytransactionService) {}

  @Post()
  create(@Body() createInventorytransactionDto: CreateInventorytransactionDto) {
    return this.inventorytransactionService.create(createInventorytransactionDto);
  }

  @Get()
  findAll() {
    return this.inventorytransactionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventorytransactionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateInventorytransactionDto: UpdateInventorytransactionDto) {
    return this.inventorytransactionService.update(+id, updateInventorytransactionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inventorytransactionService.remove(+id);
  }
}
