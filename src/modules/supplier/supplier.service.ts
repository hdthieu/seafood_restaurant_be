import { Injectable, Res } from '@nestjs/common';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { ILike, Repository } from 'typeorm';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { SupplierStatus } from 'src/common/enums';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { SupplierGroup } from '@modules/suppliergroup/entities/suppliergroup.entity';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(SupplierGroup)
    private readonly groupRepo: Repository<SupplierGroup>,
  ) { }

  /** Tạo NCC: check trùng code + validate group */
  async create(dto: CreateSupplierDto) {
    // unique code
    const dup = await this.supplierRepo.exists({ where: { code: dto.code } });
    if (dup) throw new ResponseCommon(400, false, 'SUPPLIER_CODE_EXISTS');

    // validate group
    if (dto.supplierGroupId) {
      const ok = await this.groupRepo.exists({ where: { id: dto.supplierGroupId } });
      if (!ok) throw new ResponseCommon(400, false, 'SUPPLIER_GROUP_NOT_FOUND');
    }

    const entity = this.supplierRepo.create(dto as any);
    return this.supplierRepo.save(entity);
  }

  /**
   * Tìm kiếm + lọc + phân trang
   * Hỗ trợ: q (code/name/phone/email/taxCode/address), status, groupId, city, page/limit
   */
  async findAll(qry: QuerySupplierDto) {
    const {
      q,
      status,
      supplierGroupId,
      city,
      page = 1,
      limit = 20,
      withGroup, // optional: load relation
    } = qry;

    // Dùng QueryBuilder để tránh OR tách nhiều lượt query
    const qb = this.supplierRepo.createQueryBuilder('s');

    if (q) {
      qb.andWhere(
        `(s.code ILIKE :q OR s.name ILIKE :q OR s.phone ILIKE :q OR s.email ILIKE :q OR s.taxCode ILIKE :q OR s.address ILIKE :q)`,
        { q: `%${q}%` },
      );
    }

    if (status) qb.andWhere('s.status = :status', { status });
    if (supplierGroupId) qb.andWhere('s.supplierGroupId = :groupId', { supplierGroupId });
    if (city) qb.andWhere('s.city ILIKE :city', { city: `%${city}%` });

    if (withGroup) {
      qb.leftJoinAndSelect('s.supplierGroup', 'g');
    }

    qb.orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(Number(limit) || 20, 100));

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: Number(page), limit: Number(limit) };
  }

  async findOne(id: string, opts?: { withGroup?: boolean }) {
    const sup = await this.supplierRepo.findOne({
      where: { id },
      relations: opts?.withGroup ? ['supplierGroup'] : [],
    });
    if (!sup) throw new ResponseCommon(404, false, 'SUPPLIER_NOT_FOUND');
    return sup;
  }

  /** Cập nhật: check đổi code + validate group */
  async update(id: string, dto: UpdateSupplierDto) {
    const sup = await this.findOne(id);

    if (dto.code && dto.code !== sup.code) {
      const dup = await this.supplierRepo.exists({ where: { code: dto.code } });
      if (dup) throw new ResponseCommon(400, false, 'SUPPLIER_CODE_EXISTS');
    }

    if (dto.supplierGroupId) {
      const ok = await this.groupRepo.exists({ where: { id: dto.supplierGroupId } });
      if (!ok) throw new ResponseCommon(400, false, 'SUPPLIER_GROUP_NOT_FOUND');
    }

    Object.assign(sup, dto);
    return this.supplierRepo.save(sup);
  }

  /** Xóa mềm: đặt status=INACTIVE */
  async remove(id: string) {
    const sup = await this.findOne(id);
    sup.status = SupplierStatus.INACTIVE;
    return this.supplierRepo.save(sup);
  }

  /** Đổi trạng thái trực tiếp */
  async setStatus(id: string, status: SupplierStatus) {
    const sup = await this.findOne(id);
    sup.status = status;
    return this.supplierRepo.save(sup);
  }

  // /** Gán/đổi nhóm hàng loạt (có thể truyền null để clear nhóm) */
  // async bulkAssignGroup(supplierIds: string[], groupId?: string | null) {
  //   if (groupId) {
  //     const ok = await this.groupRepo.exists({ where: { id: groupId } });
  //     if (!ok) throw new BadRequestException('SUPPLIER_GROUP_NOT_FOUND');
  //   }
  //   await this.supplierRepo.update({ id: In(supplierIds) }, { supplierGroupId: groupId ?? null });
  //   return { success: true };
  // }
}
