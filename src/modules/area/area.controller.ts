import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { AreaService } from './area.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';

@Controller('area')
@ApiBearerAuth()
export class AreaController {
  constructor(private readonly areaService: AreaService) { }

  // this endpoint for create new area
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateAreaDto) {
    return this.areaService.createArea(dto);
  }



}
