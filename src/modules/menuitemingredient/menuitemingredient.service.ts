import { Injectable } from '@nestjs/common';
import { CreateMenuitemingredientDto } from './dto/create-menuitemingredient.dto';
import { UpdateMenuitemingredientDto } from './dto/update-menuitemingredient.dto';

@Injectable()
export class MenuitemingredientService {
  create(createMenuitemingredientDto: CreateMenuitemingredientDto) {
    return 'This action adds a new menuitemingredient';
  }

  findAll() {
    return `This action returns all menuitemingredient`;
  }

  findOne(id: number) {
    return `This action returns a #${id} menuitemingredient`;
  }

  update(id: number, updateMenuitemingredientDto: UpdateMenuitemingredientDto) {
    return `This action updates a #${id} menuitemingredient`;
  }

  remove(id: number) {
    return `This action removes a #${id} menuitemingredient`;
  }
}
