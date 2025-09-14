import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PurchasereceiptitemService } from './purchasereceiptitem.service';
import { CreatePurchasereceiptitemDto } from './dto/create-purchasereceiptitem.dto';
import { UpdatePurchasereceiptitemDto } from './dto/update-purchasereceiptitem.dto';

@Controller('purchasereceiptitem')
export class PurchasereceiptitemController {
  constructor(private readonly purchasereceiptitemService: PurchasereceiptitemService) {}

  @Post()
  create(@Body() createPurchasereceiptitemDto: CreatePurchasereceiptitemDto) {
    return this.purchasereceiptitemService.create(createPurchasereceiptitemDto);
  }

  @Get()
  findAll() {
    return this.purchasereceiptitemService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchasereceiptitemService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePurchasereceiptitemDto: UpdatePurchasereceiptitemDto) {
    return this.purchasereceiptitemService.update(+id, updatePurchasereceiptitemDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.purchasereceiptitemService.remove(+id);
  }
}
