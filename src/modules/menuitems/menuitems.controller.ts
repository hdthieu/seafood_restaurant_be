import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MenuitemsService } from './menuitems.service';
import { CreateMenuitemDto } from './dto/create-menuitem.dto';
import { UpdateMenuitemDto } from './dto/update-menuitem.dto';

@Controller('menuitems')
export class MenuitemsController {
  constructor(private readonly menuitemsService: MenuitemsService) {}

  @Post()
  create(@Body() createMenuitemDto: CreateMenuitemDto) {
    return this.menuitemsService.create(createMenuitemDto);
  }

  @Get()
  findAll() {
    return this.menuitemsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.menuitemsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMenuitemDto: UpdateMenuitemDto) {
    return this.menuitemsService.update(+id, updateMenuitemDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menuitemsService.remove(+id);
  }
}
