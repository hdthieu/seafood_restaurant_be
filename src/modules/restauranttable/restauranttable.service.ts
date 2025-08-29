import { Injectable } from '@nestjs/common';
import { CreateRestauranttableDto } from './dto/create-restauranttable.dto';
import { UpdateRestauranttableDto } from './dto/update-restauranttable.dto';

@Injectable()
export class RestauranttableService {
  create(createRestauranttableDto: CreateRestauranttableDto) {
    return 'This action adds a new restauranttable';
  }

  findAll() {
    return `This action returns all restauranttable`;
  }

  findOne(id: number) {
    return `This action returns a #${id} restauranttable`;
  }

  update(id: number, updateRestauranttableDto: UpdateRestauranttableDto) {
    return `This action updates a #${id} restauranttable`;
  }

  remove(id: number) {
    return `This action removes a #${id} restauranttable`;
  }
}
