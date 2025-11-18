import { Injectable, Res } from '@nestjs/common';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { Repository } from 'typeorm';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { SupplierStatus } from 'src/common/enums';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { SupplierGroup } from '@modules/suppliergroup/entities/suppliergroup.entity';
import { PageMeta } from 'src/common/common_dto/paginated';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { PurchaseReturn } from '@modules/purchasereturn/entities/purchasereturn.entity';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(SupplierGroup)
    private readonly groupRepo: Repository<SupplierGroup>,

    @InjectRepository(PurchaseReceipt)
    private readonly purchaseReceiptRepo: Repository<PurchaseReceipt>,

    @InjectRepository(PurchaseReturn)
    private readonly purchaseReturnRepo: Repository<PurchaseReturn>,
  ) { }

  /** Tạo NCC: check trùng code + validate group */
  private async generateSupplierCode(): Promise<string> {
    // Ví dụ: SUP-7D3K9Q (6 ký tự base36), đơn giản và đủ dùng cho khoá luận
    const rand = Math.random().toString(36).toUpperCase().slice(2, 8);
    return `SUP-${rand}`;
  }

  private async generateUniqueSupplierCode(maxRetries = 5): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      const code = await this.generateSupplierCode();
      const exists = await this.supplierRepo.exists({ where: { code } });
      if (!exists) return code;
    }
    throw new ResponseCommon(500, false, 'CANNOT_GENERATE_UNIQUE_SUPPLIER_CODE');
  }

  async create(dto: CreateSupplierDto) {
    // validate group
    if (dto.supplierGroupId) {
      const ok = await this.groupRepo.exists({ where: { id: dto.supplierGroupId } });
      if (!ok) throw new ResponseCommon(400, false, 'SUPPLIER_GROUP_NOT_FOUND');
    }

    // Tự sinh code, không nhận từ FE
    const code = await this.generateUniqueSupplierCode();

    const entity = this.supplierRepo.create({ ...dto, code } as Supplier);
    // Dù đã check, vẫn nên để unique index ở DB để chốt chặn
    try {
      return await this.supplierRepo.save(entity);
    } catch (e: any) {
      // Nếu race-condition hiếm gặp → thử lại 1 lần
      if (e?.code === '23505' /* unique_violation */) {
        entity.code = await this.generateUniqueSupplierCode();
        return await this.supplierRepo.save(entity);
      }
      throw new ResponseCommon(500, false, 'CREATE_SUPPLIER_FAILED', e?.message);
    }
  }

  /** Cập nhật: check đổi code + validate group */
  async update(id: string, dto: UpdateSupplierDto) {
    const sup = await this.findOne(id);

    if (dto.supplierGroupId) {
      const ok = await this.groupRepo.exists({ where: { id: dto.supplierGroupId } });
      if (!ok) throw new ResponseCommon(400, false, 'SUPPLIER_GROUP_NOT_FOUND');
    }

    Object.assign(sup, dto);
    return this.supplierRepo.save(sup);
  }

  /**
   * Tìm kiếm + lọc + phân trang
   * Hỗ trợ: q (code/name/phone/email/taxCode/address), status, groupId, city, page/limit
   */
  async findAll(qry: QuerySupplierDto) {
    try {
      let {
        q,
        status,
        supplierGroupId,
        city,
        page = 1,
        limit = 20,
        withGroup, // optional: load relation
      } = qry;

      // chuẩn hóa page/limit
      page = Math.max(1, Number(page || 1));
      limit = Math.min(100, Math.max(1, Number(limit || 20)));

      const qb = this.supplierRepo.createQueryBuilder('s');

      // search
      const keyword = q?.trim();
      if (keyword) {
        qb.andWhere(
          `(s.code ILIKE :q OR s.name ILIKE :q OR s.phone ILIKE :q OR s.email ILIKE :q OR s.taxCode ILIKE :q OR s.address ILIKE :q)`,
          { q: `%${keyword}%` },
        );
      }

      // filters
      if (status) qb.andWhere('s.status = :status', { status });
      if (supplierGroupId) qb.andWhere('s.supplierGroupId = :groupId', { groupId: supplierGroupId });

      const cityKw = city?.trim();
      if (cityKw) qb.andWhere('s.city ILIKE :city', { city: `%${cityKw}%` });

      if (withGroup) {
        qb.leftJoinAndSelect('s.supplierGroup', 'g');
      }

      qb.orderBy('s.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [items, total] = await qb.getManyAndCount();

      return new ResponseCommon<typeof items, PageMeta>(
        200,
        true,
        'Lấy danh sách nhà cung cấp thành công',
        items,
        {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 0,
        },
      );
    } catch (error) {
      throw new ResponseException(error, 500, 'Không thể lấy danh sách nhà cung cấp');
    }
  }


  async findOne(id: string, opts?: { withGroup?: boolean }) {
    const sup = await this.supplierRepo.findOne({
      where: { id },
      relations: opts?.withGroup ? ['supplierGroup'] : [],
    });
    if (!sup) throw new ResponseCommon(404, false, 'SUPPLIER_NOT_FOUND');
    return sup;
  }

  /**
   * Xóa NCC theo nghiệp vụ:
   * - Nếu chưa phát sinh phiếu nhập / phiếu trả → xóa cứng khỏi DB.
   * - Nếu đã phát sinh chứng từ → chỉ ngừng hợp tác (status = INACTIVE).
   */
  async remove(id: string) {
    const sup = await this.findOne(id); // sẽ throw SUPPLIER_NOT_FOUND nếu không có

    // Kiểm tra có phiếu nhập không
    const hasReceipts = await this.purchaseReceiptRepo.exists({
      where: { supplier: { id } }, // nếu entity dùng supplierId thì đổi thành { supplierId: id }
    });

    // Kiểm tra có phiếu trả không
    const hasReturns = await this.purchaseReturnRepo.exists({
      where: { supplier: { id } },
    });

    // ĐÃ có giao dịch -> chỉ ngừng hợp tác
    if (hasReceipts || hasReturns) {
      if (sup.status !== SupplierStatus.INACTIVE) {
        sup.status = SupplierStatus.INACTIVE;
        await this.supplierRepo.save(sup);
      }
      return new ResponseCommon(200, true, 'SUPPLIER_DEACTIVATED_BECAUSE_HAS_TRANSACTIONS', sup);
    }
    await this.supplierRepo.delete(id);
    return new ResponseCommon(200, true, 'SUPPLIER_DELETED_SUCCESSFULLY');
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
