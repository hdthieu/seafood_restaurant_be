import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MenucategoryService } from './menucategory.service';
import { CreateMenucategoryDto } from './dto/create-menucategory.dto';
import { UpdateMenucategoryDto } from './dto/update-menucategory.dto';

@Controller('menucategory')
export class MenucategoryController {
  constructor(private readonly menucategoryService: MenucategoryService) {}

  @Post()
  create(@Body() createMenucategoryDto: CreateMenucategoryDto) {
    return this.menucategoryService.create(createMenucategoryDto);
  }

  @Get()
  findAll() {
    return this.menucategoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.menucategoryService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMenucategoryDto: UpdateMenucategoryDto) {
    return this.menucategoryService.update(+id, updateMenucategoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menucategoryService.remove(+id);
  }
}
