import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InventorytransactionService } from './inventorytransaction.service';
import { CreateInventorytransactionDto } from './dto/create-inventorytransaction.dto';
import { UpdateInventorytransactionDto } from './dto/update-inventorytransaction.dto';

@Controller('inventorytransaction')
export class InventorytransactionController {
  constructor(private readonly inventorytransactionService: InventorytransactionService) { }

}
