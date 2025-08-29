import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MenuitemingredientService } from './menuitemingredient.service';
import { CreateMenuitemingredientDto } from './dto/create-menuitemingredient.dto';
import { UpdateMenuitemingredientDto } from './dto/update-menuitemingredient.dto';

@Controller('menuitemingredient')
export class MenuitemingredientController {
  constructor(private readonly menuitemingredientService: MenuitemingredientService) {}

  @Post()
  create(@Body() createMenuitemingredientDto: CreateMenuitemingredientDto) {
    return this.menuitemingredientService.create(createMenuitemingredientDto);
  }

  @Get()
  findAll() {
    return this.menuitemingredientService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.menuitemingredientService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMenuitemingredientDto: UpdateMenuitemingredientDto) {
    return this.menuitemingredientService.update(+id, updateMenuitemingredientDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menuitemingredientService.remove(+id);
  }
}
