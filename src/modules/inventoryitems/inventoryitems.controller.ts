import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Put } from '@nestjs/common';
import { InventoryitemsService } from './inventoryitems.service';
import { CreateInventoryitemDto } from './dto/create-inventoryitem.dto';
import { UpdateInventoryitemDto } from './dto/update-inventoryitem.dto';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ListInventoryItemsQueryDto } from './dto/list-inventory-items.query.dto';
import { ListIngredientsDto } from './dto/list-ingredients.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';

@Controller('inventoryitems')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class InventoryitemsController {
  constructor(private readonly inventoryitemsService: InventoryitemsService) { }

  // // this endpoint create new inventory item
  @Post('/create')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new inventory item (ingredient)' })
  async create(@Body() dto: CreateInventoryitemDto) {
    return this.inventoryitemsService.create(dto);
  }

  @Get('/list-ingredients')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  @ApiOperation({ summary: 'Get List Ingredients' })
  async getAll(@Query() dto: ListIngredientsDto) {
    return this.inventoryitemsService.findAll(dto);
  }

  // this endpoint will update inventory item details by its ID
  @Get('/list-ingre-by-cate/:categoryId')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  @ApiOperation({ summary: 'Get List Ingredients with category' })
  list(@Query() query: ListInventoryItemsQueryDto) {
    return this.inventoryitemsService.listItems(query);
  }

  @Get(':itemId/uoms')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  @ApiOperation({ summary: 'Get UOMs for a specific inventory item' })
  async getUomsForItem(@Param('itemId') itemId: string) {
    return this.inventoryitemsService.getUomsForItem(itemId);
  }

  // Get single item detail
  @Get(':id')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.KITCHEN, UserRole.WAITER)
  @ApiOperation({ summary: 'Get one inventory item detail' })
  async findOne(@Param('id') id: string) {
    return this.inventoryitemsService.findOne(id);
  }

  // Update item (name / alertThreshold / description)
  @Put(':id')
  @Roles(UserRole.MANAGER)
  @ApiOperation({ summary: 'Update an inventory item' })
  async update(@Param('id') id: string, @Body() dto: UpdateInventoryitemDto) {
    return this.inventoryitemsService.update(id, dto);
  }

  // Soft delete (deactivate) item
  // ?hard=true => attempt hard delete (only allowed when safety checks pass)
  // ?force=true => force zero stock then deactivate (audit WASTE tx)
  // @Delete(':id')
  // @Roles(UserRole.MANAGER)
  // @ApiOperation({ summary: 'Delete an inventory item. Use ?force=true to zero stock then deactivate; use ?hard=true to permanently delete if allowed.' })
  // async remove(
  //   @Param('id') id: string,
  //   @Query('hard') hard?: string,
  //   @Query('force') force?: string,
  // ) {
  //   if (hard === 'true' || hard === '1') return this.inventoryitemsService.hardDelete(id);
  //   const f = force === 'true' || force === '1';
  //   return this.inventoryitemsService.remove(id, f);
  // }

}
