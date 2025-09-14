import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PurchasereceiptService } from './purchasereceipt.service';
import { CreatePurchasereceiptDto } from './dto/create-purchasereceipt.dto';
import { UpdatePurchasereceiptDto } from './dto/update-purchasereceipt.dto';

@Controller('purchasereceipt')
export class PurchasereceiptController {
  constructor(private readonly purchasereceiptService: PurchasereceiptService) {}

  @Post()
  create(@Body() createPurchasereceiptDto: CreatePurchasereceiptDto) {
    return this.purchasereceiptService.create(createPurchasereceiptDto);
  }

  @Get()
  findAll() {
    return this.purchasereceiptService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchasereceiptService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePurchasereceiptDto: UpdatePurchasereceiptDto) {
    return this.purchasereceiptService.update(+id, updatePurchasereceiptDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.purchasereceiptService.remove(+id);
  }
}
