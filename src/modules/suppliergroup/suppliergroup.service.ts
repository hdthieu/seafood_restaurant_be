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

  private async generateGroupCode(): Promise<string> {
    const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
    return `SG-${rand}`;
  }

  private async generateUniqueGroupCode(maxRetries = 5): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      const code = await this.generateGroupCode();
      const exists = await this.groupRepo.exists({ where: { code } });
      if (!exists) return code;
    }
    throw new ResponseCommon(500, false, 'CANNOT_GENERATE_UNIQUE_SUPPLIER_GROUP_CODE');
  }

  async create(dto: CreateSupplierGroupDto) {
    // check trùng name
    const exists = await this.groupRepo.exists({ where: { name: dto.name } });
    if (exists) throw new ResponseCommon(400, false, 'SUPPLIER_GROUP_NAME_EXISTS');

    const code = await this.generateUniqueGroupCode();
    const entity = this.groupRepo.create({ ...dto, code });

    try {
      return await this.groupRepo.save(entity);
    } catch (e: any) {
      if (e?.code === '23505') {
        // hiếm khi trùng do race → thử lại
        entity.code = await this.generateUniqueGroupCode();
        return await this.groupRepo.save(entity);
      }
      throw new ResponseCommon(500, false, 'CREATE_SUPPLIER_GROUP_FAILED', e?.message);
    }
  }
}
