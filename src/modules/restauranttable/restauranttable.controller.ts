import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RestauranttableService } from './restauranttable.service';
import { CreateRestauranttableDto } from './dto/create-restauranttable.dto';
import { UpdateRestauranttableDto } from './dto/update-restauranttable.dto';

@Controller('restauranttable')
export class RestauranttableController {
  constructor(private readonly restauranttableService: RestauranttableService) {}

  @Post()
  create(@Body() createRestauranttableDto: CreateRestauranttableDto) {
    return this.restauranttableService.create(createRestauranttableDto);
  }

  @Get()
  findAll() {
    return this.restauranttableService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.restauranttableService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRestauranttableDto: UpdateRestauranttableDto) {
    return this.restauranttableService.update(+id, updateRestauranttableDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.restauranttableService.remove(+id);
  }
}
