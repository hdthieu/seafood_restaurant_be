import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OrderitemsService } from './orderitems.service';
import { AddOrderItemDto } from './dto/create-orderitem.dto';
import { UpdateOrderitemDto } from './dto/update-orderitem.dto';

@Controller('orderitems')
export class OrderitemsController {
  constructor(private readonly orderitemsService: OrderitemsService) { }

}
