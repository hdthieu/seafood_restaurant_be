// src/modules/branch/branch.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../entities/branch.entity';



// src/modules/user/services/branch.service.ts
@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch) private readonly repo: Repository<Branch>,
  ) {}

  /** Trả về id chi nhánh mặc định. Nếu chưa có -> tạo mới. */
  async ensureDefaultId(): Promise<string> {
    // 1) đã có mặc định?
    let b = await this.repo.findOne({ where: { isDefault: true } });
    if (b) return b.id;

    // 2) thử lấy theo code MAIN (nếu đã seed trước đây)
    b = await this.repo.findOne({ where: { code: 'MAIN' } });
    if (b) {
      if (!b.isDefault) {
        b.isDefault = true;
        await this.repo.save(b);
      }
      return b.id;
    }

    // 3) chưa có -> tạo mới
    b = this.repo.create({
      name: 'Chi nhánh trung tâm',
      code: 'MAIN',
      isDefault: true,
      // tuỳ bạn: address / province / district / ward...
    });
    b = await this.repo.save(b);
    return b.id;
  }
}

