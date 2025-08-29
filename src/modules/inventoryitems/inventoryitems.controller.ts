import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InventoryitemsService } from './inventoryitems.service';
import { CreateInventoryitemDto } from './dto/create-inventoryitem.dto';
import { UpdateInventoryitemDto } from './dto/update-inventoryitem.dto';

@Controller('inventoryitems')
export class InventoryitemsController {
  constructor(private readonly inventoryitemsService: InventoryitemsService) { }

}
