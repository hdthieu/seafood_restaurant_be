import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MenucategoryService } from './menucategory.service';
import { CreateMenucategoryDto } from './dto/create-menucategory.dto';
import { UpdateMenucategoryDto } from './dto/update-menucategory.dto';

@Controller('menucategory')
export class MenucategoryController {
  constructor(private readonly menucategoryService: MenucategoryService) { }

}
