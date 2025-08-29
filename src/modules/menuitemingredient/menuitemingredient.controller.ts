import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MenuitemingredientService } from './menuitemingredient.service';
import { CreateMenuitemingredientDto } from './dto/create-menuitemingredient.dto';
import { UpdateMenuitemingredientDto } from './dto/update-menuitemingredient.dto';

@Controller('menuitemingredient')
export class MenuitemingredientController {
  constructor(private readonly menuitemingredientService: MenuitemingredientService) { }

}
