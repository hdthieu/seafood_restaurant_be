import { Injectable } from '@nestjs/common';
import { CreateSupplierGroupDto } from './dto/create-suppliergroup.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SupplierGroup } from './entities/suppliergroup.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { Repository } from 'typeorm';
import { QuerySupplierGroupDto } from './dto/query-supplier-group.dto';
import { UpdateSuppliergroupDto } from './dto/update-suppliergroup.dto';
import { SupplierStatus } from 'src/common/enums';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { PageMeta } from 'src/common/common_dto/paginated';

@Injectable()
export class SuppliergroupService {
  constructor(
    @InjectRepository(SupplierGroup) private readonly groupRepo: Repository<SupplierGroup>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
  ) { }

  // Sinh code dạng SG-XXXX (4 ký tự base36)
  private async generateGroupCode(): Promise<string> {
    const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
    return `SG-${rand}`;
  }

  // Thử sinh code nhiều lần, nếu vẫn trùng thì lỗi
  private async generateUniqueGroupCode(maxRetries = 5): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      const code = await this.generateGroupCode();
      const exists = await this.groupRepo.exists({ where: { code } });
      if (!exists) return code;
    }
    throw new ResponseException(null, 500, 'CANNOT_GENERATE_UNIQUE_SUPPLIER_GROUP_CODE');
  }

  // Hàm tạo nhóm nhà cung cấp
  async create(dto: CreateSupplierGroupDto) {
    // check trùng name
    const exists = await this.groupRepo.exists({ where: { name: dto.name } });
    if (exists) throw new ResponseException(null, 400, 'SUPPLIER_GROUP_NAME_EXISTS');

    // Tự sinh code, không nhận từ FE
    const code = await this.generateUniqueGroupCode();
    const entity = this.groupRepo.create({ ...dto, code });

    try {
      return await this.groupRepo.save(entity);
    } catch (e: any) {
      // kiểm tra lỗi trùng code
      if (e?.code === '23505') {
        // hiếm khi trùng do race → thử lại
        entity.code = await this.generateUniqueGroupCode();
        return await this.groupRepo.save(entity);
      }
      throw new ResponseException(e?.message, 500, 'CREATE_SUPPLIER_GROUP_FAILED');
    }
  }

  async findAll(q: QuerySupplierGroupDto) {
    try {
      let {
        page = 1,
        limit = 20,
        search,
        status,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
      } = q;

      // Chuẩn hóa page/limit
      page = Math.max(1, Number(page || 1));
      limit = Math.min(100, Math.max(1, Number(limit || 20)));

      // Whitelist sort
      const SORTABLE_FIELDS = new Set(['createdAt', 'name', 'code']);
      const sortField = SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';
      const order: 'ASC' | 'DESC' =
        String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const qb = this.groupRepo.createQueryBuilder('g');

      const kw = search?.trim();
      if (kw) {
        qb.andWhere('(g.name ILIKE :kw OR g.code ILIKE :kw)', { kw: `%${kw}%` });
      }

      if (status) {
        qb.andWhere('g.status = :status', { status });
      }

      qb.orderBy(`g.${sortField}`, order)
        .skip((page - 1) * limit)
        .take(limit);

      const [items, total] = await qb.getManyAndCount();

      return new ResponseCommon<typeof items, PageMeta>(
        200,
        true,
        'Lấy danh sách nhóm nhà cung cấp thành công',
        items,
        {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 0,
        },
      );
    } catch (error) {
      throw new ResponseException(error, 500, 'Không thể lấy danh sách nhóm nhà cung cấp');
    }
  }


  async findOneById(id: string) {
    const found = await this.groupRepo.findOne({ where: { id }, relations: ['suppliers'] });
    if (!found) throw new ResponseException(null, 404, 'SUPPLIER_GROUP_NOT_FOUND');
    return found;
  }

  async findOneByCode(code: string) {
    const found = await this.groupRepo.findOne({ where: { code }, relations: ['suppliers'] });
    if (!found) throw new ResponseException(null, 404, 'SUPPLIER_GROUP_NOT_FOUND');
    return found;
  }
  async update(id: string, dto: UpdateSuppliergroupDto) {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new ResponseException(null, 404, 'SUPPLIER_GROUP_NOT_FOUND');

    if (dto.name && dto.name !== group.name) {
      const nameDup = await this.groupRepo.exists({ where: { name: dto.name } });
      if (nameDup) throw new ResponseException(null, 400, 'SUPPLIER_GROUP_NAME_EXISTS');
    }

    Object.assign(group, dto);
    return this.groupRepo.save(group);
  }

  // ======= NGHIỆP VỤ: deactivate & remove =======
  /** Ngưng hoạt động (khuyên dùng theo nghiệp vụ) */
  async deactivate(id: string) {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new ResponseException(null, 404, 'SUPPLIER_GROUP_NOT_FOUND');

    if (group.status === SupplierStatus.INACTIVE) return group;
    group.status = SupplierStatus.INACTIVE;
    return this.groupRepo.save(group);
  }

  /**
   * Xoá nhóm:
   * - Nếu còn supplier → BẮT BUỘC có reassignToId (chuyển tất cả supplier sang nhóm đích) rồi mới xoá.
   * - Nếu không còn supplier → xoá thẳng.
   */
  // async remove(id: string, reassignToId?: string) {
  //   const group = await this.groupRepo.findOne({ where: { id } });
  //   if (!group) throw new ResponseCommon(404, false, 'SUPPLIER_GROUP_NOT_FOUND');

  //   const supplierCount = await this.supplierRepo.count({ where: { supplierGroupId: id } });

  //   // còn supplier → cần nhóm đích
  //   if (supplierCount > 0) {
  //     if (!reassignToId) {
  //       throw new ResponseCommon(400, false, 'GROUP_HAS_SUPPLIERS_REASSIGN_REQUIRED');
  //     }
  //     if (reassignToId === id) {
  //       throw new ResponseCommon(400, false, 'REASSIGN_TARGET_MUST_DIFFER');
  //     }

  //     const target = await this.groupRepo.findOne({ where: { id: reassignToId } });
  //     if (!target) throw new ResponseCommon(400, false, 'TARGET_GROUP_NOT_FOUND');
  //     if (target.status === SupplierStatus.INACTIVE) {
  //       throw new ResponseCommon(400, false, 'TARGET_GROUP_INACTIVE');
  //     }

  //     // transaction: chuyển NCC rồi xoá nhóm
  //     await this.groupRepo.manager.transaction(async (trx) => {
  //       await trx.getRepository(Supplier).update(
  //         { supplierGroupId: id },
  //         { supplierGroupId: reassignToId },
  //       );
  //       await trx.getRepository(SupplierGroup).delete(id);
  //     });

  //     return new ResponseCommon(200, true, 'SUPPLIER_GROUP_DELETED_WITH_REASSIGN', {
  //       movedSuppliers: supplierCount,
  //       toGroupId: reassignToId,
  //     });
  //   }

  //   // không còn supplier → xoá luôn
  //   await this.groupRepo.delete(id);
  //   return new ResponseCommon(200, true, 'SUPPLIER_GROUP_DELETED');
  // }

}
