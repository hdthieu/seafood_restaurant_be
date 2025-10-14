import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { InventoryitemsService } from './inventoryitems.service';
import { CreateInventoryitemDto } from './dto/create-inventoryitem.dto';
import { UpdateInventoryitemDto } from './dto/update-inventoryitem.dto';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ListInventoryItemsQueryDto } from './dto/list-inventory-items.query.dto';
import { ListIngredientsDto } from './dto/list-ingredients.dto';

@Controller('inventoryitems')
@ApiBearerAuth()
export class InventoryitemsController {
  constructor(private readonly inventoryitemsService: InventoryitemsService) { }

  // // this endpoint create new inventory item
  // @Post('/stockin-ingredients')
  // @UseGuards(JwtAuthGuard)
  // @ApiOperation({ summary: 'Stock In Ingredients [By MANAGEMENT]' })
  // async create(@Body() dto: CreateInventoryitemDto) {
  //   return this.inventoryitemsService.create(dto);
  // }

  @Get('/list-ingredients')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get List Ingredients' })
  async getAll(@Query() dto: ListIngredientsDto) {
    return this.inventoryitemsService.findAll(dto);
  }

  // this endpoint will update inventory item details by its ID
  @Get('/list-ingre-by-cate/:categoryId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get List Ingredients with category' })
  list(@Query() query: ListInventoryItemsQueryDto) {
    return this.inventoryitemsService.listItems(query);
  }

  @Get(':itemId/uoms')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get UOMs for a specific inventory item' })
  async getUomsForItem(@Param('itemId') itemId: string) {
    return this.inventoryitemsService.getUomsForItem(itemId);
  }

}
