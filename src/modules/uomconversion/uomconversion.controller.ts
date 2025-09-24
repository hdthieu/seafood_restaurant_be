import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UomconversionService } from './uomconversion.service';
import { CreateUomconversionDto } from './dto/create-uomconversion.dto';
import { UpdateUomconversionDto } from './dto/update-uomconversion.dto';

@Controller('uomconversion')
export class UomconversionController {
  constructor(private readonly uomconversionService: UomconversionService) {}

  @Post()
  create(@Body() createUomconversionDto: CreateUomconversionDto) {
    return this.uomconversionService.create(createUomconversionDto);
  }

  @Get()
  findAll() {
    return this.uomconversionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.uomconversionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUomconversionDto: UpdateUomconversionDto) {
    return this.uomconversionService.update(+id, updateUomconversionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.uomconversionService.remove(+id);
  }
}
