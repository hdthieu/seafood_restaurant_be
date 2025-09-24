import { Injectable } from '@nestjs/common';
import { CreateUomconversionDto } from './dto/create-uomconversion.dto';
import { UpdateUomconversionDto } from './dto/update-uomconversion.dto';

@Injectable()
export class UomconversionService {
  create(createUomconversionDto: CreateUomconversionDto) {
    return 'This action adds a new uomconversion';
  }

  findAll() {
    return `This action returns all uomconversion`;
  }

  findOne(id: number) {
    return `This action returns a #${id} uomconversion`;
  }

  update(id: number, updateUomconversionDto: UpdateUomconversionDto) {
    return `This action updates a #${id} uomconversion`;
  }

  remove(id: number) {
    return `This action removes a #${id} uomconversion`;
  }
}
