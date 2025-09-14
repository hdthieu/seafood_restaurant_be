import { Injectable } from '@nestjs/common';
import { CreateSupplierGroupDto } from './dto/create-suppliergroup.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SupplierGroup } from './entities/suppliergroup.entity';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { Repository } from 'typeorm';

@Injectable()
export class SuppliergroupService {
  constructor(
    @InjectRepository(SupplierGroup) private readonly groupRepo: Repository<SupplierGroup>,
  ) { }

  async create(dto: CreateSupplierGroupDto) {
    const exists = await this.groupRepo.exists({ where: [{ code: dto.code }, { name: dto.name }] });
    if (exists) throw new ResponseCommon(400, false, 'SUPPLIER_GROUP_CODE_OR_NAME_EXISTED');
    const entity = this.groupRepo.create(dto);
    return this.groupRepo.save(entity);
  }
}
