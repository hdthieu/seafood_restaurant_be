import { Injectable } from '@nestjs/common';
import { CreateMenucategoryDto } from './dto/create-menucategory.dto';
import { UpdateMenucategoryDto } from './dto/update-menucategory.dto';

@Injectable()
export class MenucategoryService {
  create(createMenucategoryDto: CreateMenucategoryDto) {
    return 'This action adds a new menucategory';
  }

  findAll() {
    return `This action returns all menucategory`;
  }

  findOne(id: number) {
    return `This action returns a #${id} menucategory`;
  }

  update(id: number, updateMenucategoryDto: UpdateMenucategoryDto) {
    return `This action updates a #${id} menucategory`;
  }

  remove(id: number) {
    return `This action removes a #${id} menucategory`;
  }
}
