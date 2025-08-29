import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OrderstatushistoryService } from './orderstatushistory.service';
import { CreateOrderstatushistoryDto } from './dto/create-orderstatushistory.dto';
import { UpdateOrderstatushistoryDto } from './dto/update-orderstatushistory.dto';

@Controller('orderstatushistory')
export class OrderstatushistoryController {
  constructor(private readonly orderstatushistoryService: OrderstatushistoryService) { }

}
