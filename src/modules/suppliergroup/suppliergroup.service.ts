import { Injectable } from '@nestjs/common';
import { CreateSupplierGroupDto } from './dto/create-suppliergroup.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SupplierGroup } from './entities/suppliergroup.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { In, Repository } from 'typeorm';
import { QuerySupplierGroupDto } from './dto/query-supplier-group.dto';
import { UpdateSuppliergroupDto } from './dto/update-suppliergroup.dto';
import { SupplierStatus } from 'src/common/enums';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { PageMeta } from 'src/common/common_dto/paginated';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { PurchaseReturn } from '@modules/purchasereturn/entities/purchasereturn.entity';

@Injectable()
export class SuppliergroupService {
  constructor(
    @InjectRepository(SupplierGroup) private readonly groupRepo: Repository<SupplierGroup>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(PurchaseReceipt) private readonly purchaseReceiptRepo: Repository<PurchaseReceipt>,
    @InjectRepository(PurchaseReturn) private readonly purchaseReturnRepo: Repository<PurchaseReturn>,
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
   * Xoá nhóm nhà cung cấp với các điều kiện nghiệp vụ:
   * - Case 1: Nhóm không có nhà cung cấp nào -> Xoá trực tiếp.
   * - Case 2: Nhóm có nhà cung cấp nhưng chưa phát sinh phiếu nhập/trả hàng -> Cho phép xoá, đồng thời cập nhật `supplierGroupId` của các NCC thành `null`.
   * - Case 3: Nhóm có nhà cung cấp và đã phát sinh phiếu nhập/trả hàng -> Không cho xoá, yêu cầu vô hiệu hoá (deactivate) thay thế.
   */
  async remove(id: string) {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new ResponseException(null, 404, 'SUPPLIER_GROUP_NOT_FOUND');

    const suppliers = await this.supplierRepo.find({ where: { supplierGroupId: id } });

    // Case 1: Không có NCC nào, xoá luôn
    if (suppliers.length === 0) {
      await this.groupRepo.delete(id);
      return new ResponseCommon(200, true, 'SUPPLIER_GROUP_DELETED_SUCCESSFULLY');
    }

    const supplierIds = suppliers.map(s => s.id);

    // Kiểm tra xem các NCC này đã có giao dịch (phiếu nhập/trả) chưa
    const hasPurchaseReceipts = await this.purchaseReceiptRepo.exists({
      where: { supplier: { id: In(supplierIds) } },
    });
    const hasPurchaseReturns = await this.purchaseReturnRepo.exists({
      where: { supplier: { id: In(supplierIds) } },
    });

    // Case 3: Đã có giao dịch, không cho xoá
    if (hasPurchaseReceipts || hasPurchaseReturns) {
      throw new ResponseException(
        null,
        400,
        'GROUP_HAS_SUPPLIERS_WITH_TRANSACTIONS_DEACTIVATION_RECOMMENDED',
      );
    }

    // Case 2: Có NCC nhưng chưa có giao dịch
    await this.groupRepo.manager.transaction(async (trx) => {
      await trx.getRepository(Supplier).update(
        { supplierGroupId: id },
        { supplierGroupId: null },
      );
      await trx.getRepository(SupplierGroup).delete(id);
    });

    return new ResponseCommon(200, true, 'SUPPLIER_GROUP_DELETED_AND_SUPPLIERS_UNLINKED');
  }


}
