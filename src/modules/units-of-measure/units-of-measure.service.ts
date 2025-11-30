import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateUnitsOfMeasureDto } from './dto/create-units-of-measure.dto';
import { UpdateUnitsOfMeasureDto } from './dto/update-units-of-measure.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UnitsOfMeasure } from './entities/units-of-measure.entity';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { PurchaseReturnLog } from '@modules/purchasereturn/entities/purchasereturnlog.entity';
import { Ingredient } from '@modules/ingredient/entities/ingredient.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { ListUnitsOfMeasureQueryDto } from './dto/list-units-of-measure.query.dto';

@Injectable()
export class UnitsOfMeasureService {
    constructor(
        @InjectRepository(UnitsOfMeasure)
        private readonly uomRepo: Repository<UnitsOfMeasure>,
        @InjectRepository(UomConversion)
        private readonly convRepo: Repository<UomConversion>,
        @InjectRepository(InventoryItem)
        private readonly invRepo: Repository<InventoryItem>,
        @InjectRepository(PurchaseReceiptItem)
        private readonly priRepo: Repository<PurchaseReceiptItem>,
        @InjectRepository(PurchaseReturnLog)
        private readonly prlRepo: Repository<PurchaseReturnLog>,
        @InjectRepository(Ingredient)
        private readonly ingRepo: Repository<Ingredient>,
    ) { }

    // async create(dto: CreateUnitsOfMeasureDto) {
    //     const code = (dto.code || '').trim().toUpperCase();
    //     const name = (dto.name || '').trim();
    //     const dimension = dto.dimension;
    //     if (!code) throw new ResponseException('UOM_CODE_REQUIRED', 400);
    //     if (!name) throw new ResponseException('UOM_NAME_REQUIRED', 400);

    //     const exists = await this.uomRepo.findOne({ where: { code } });
    //     if (exists) throw new ResponseException('UOM_CODE_EXISTS', 400);
    //     const u = this.uomRepo.create({ code, name, dimension });
    //     await this.uomRepo.save(u);
    //     return new ResponseCommon(201, true, 'UOM_CREATED', u);
    // }

    async create(dto: CreateUnitsOfMeasureDto) {
        const code = (dto.code || '').trim().toUpperCase();
        const name = (dto.name || '').trim();
        const dimension = dto.dimension;

        if (!code) throw new ResponseException('UOM_CODE_REQUIRED', 400);
        if (!name) throw new ResponseException('UOM_NAME_REQUIRED', 400);

        const exists = await this.uomRepo.findOne({ where: { code } });
        if (exists) throw new ResponseException('UOM_CODE_EXISTS', 400);

        let baseCode = (dto.baseCode || '').trim().toUpperCase() || code;

        // Nếu baseCode khác code -> verify
        if (baseCode !== code) {
            const base = await this.uomRepo.findOne({ where: { code: baseCode } });
            if (!base) throw new ResponseException('BASE_UOM_NOT_FOUND', 400);
            if (base.dimension !== dimension) {
                throw new ResponseException('BASE_DIMENSION_MISMATCH', 400);
            }
        }

        const u = this.uomRepo.create({ code, name, dimension, baseCode });
        await this.uomRepo.save(u);
        return new ResponseCommon(201, true, 'UOM_CREATED', u);
    }



    async list(dto: ListUnitsOfMeasureQueryDto) {
        const page = Math.max(1, Number(dto.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(dto.limit) || 20));
        const qb = this.uomRepo.createQueryBuilder('u')
            .leftJoin('units_of_measure', 'base', 'u.base_code = base.code')
            .addSelect('base.name', 'baseName');

        if (dto.code) qb.andWhere('u.code = :code', { code: dto.code.toUpperCase().trim() });
        if (dto.name) qb.andWhere('u.name ILIKE :name', { name: `%${dto.name.trim()}%` });
        if (dto.dimension) qb.andWhere('u.dimension = :dimension', { dimension: dto.dimension });
        if (dto.q) qb.andWhere('(u.code ILIKE :q OR u.name ILIKE :q)', { q: `%${dto.q.trim()}%` });
        if (dto.isActive !== undefined) qb.andWhere('u.isActive = :isActive', { isActive: dto.isActive });

        const sortBy = (dto.sortBy || 'code');
        const sortDir = ((dto.sortDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC');
        qb.orderBy(`u.${sortBy}`, sortDir as any);

        qb.skip((page - 1) * limit).take(limit);
        const resultData = await qb.getRawAndEntities();
        const rows = resultData.entities;
        const total = await qb.getCount();
        const result = rows.map((u, i) => ({
            ...u,
            baseName: resultData.raw[i].baseName,
        }));
        return new ResponseCommon(200, true, 'OK', result, {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 0,
        });
    }

    async getOne(code: string) {
        const u = await this.uomRepo.createQueryBuilder('u')
            .leftJoin('units_of_measure', 'base', 'u.base_code = base.code')
            .addSelect('base.name', 'baseName')
            .where('u.code = :code', { code: code.toUpperCase() })
            .getRawAndEntities();
        if (!u.entities[0]) throw new ResponseException('UOM_NOT_FOUND', 404);
        const result = {
            ...u.entities[0],
            baseName: u.raw[0].baseName,
        };
        return new ResponseCommon(200, true, 'OK', result);
    }

    async update(code: string, dto: UpdateUnitsOfMeasureDto) {
        const u = await this.uomRepo.findOne({ where: { code: code.toUpperCase() } });
        if (!u) throw new ResponseException('UOM_NOT_FOUND', 404);

        const nextName = (dto.name ?? u.name).trim();
        const nextDim = (dto.dimension ?? u.dimension) as any;
        let nextBaseCode = (dto.baseCode ?? u.baseCode ?? u.code).toUpperCase();

        // Nếu đổi dimension -> check đang được dùng (code bạn đã có)
        if (dto.dimension && dto.dimension !== u.dimension) {
            const usedInConv = await this.convRepo.createQueryBuilder('c')
                .leftJoin('c.from', 'f').leftJoin('c.to', 't')
                .where('f.code = :code OR t.code = :code', { code: u.code }).getCount();
            if (usedInConv > 0) {
                throw new ResponseException('UOM_IN_USE_CANNOT_CHANGE_DIMENSION', 400);
            }
        }

        // Nếu đổi baseCode -> validate base
        if (dto.baseCode && dto.baseCode.toUpperCase() !== u.baseCode) {
            const base = await this.uomRepo.findOne({ where: { code: nextBaseCode } });
            if (!base) throw new ResponseException('BASE_UOM_NOT_FOUND', 400);
            if (base.dimension !== nextDim) {
                throw new ResponseException('BASE_DIMENSION_MISMATCH', 400);
            }
        }

        u.name = nextName;
        u.dimension = nextDim;
        u.baseCode = nextBaseCode;

        await this.uomRepo.save(u);
        return new ResponseCommon(200, true, 'UPDATED', u);
    }


    async remove(code: string) {
        const u = await this.uomRepo.findOne({ where: { code: code.toUpperCase() } });
        if (!u) throw new ResponseException('UOM_NOT_FOUND', 404);

        // --- SỬA ĐỔI 1: Tách logic kiểm tra Conversion ---
        
        // Chỉ coi là "Đang sử dụng" nếu đơn vị này là ĐÍCH ĐẾN (Base Unit) của một quy đổi khác.
        // Ví dụ: Đang xóa "Lon" mà có "Thùng" quy đổi từ "Lon" -> Chặn.
        const usedAsBase = await this.convRepo.createQueryBuilder('c')
            .leftJoin('c.to', 't')
            .where('t.code = :code', { code: u.code }) 
            .getCount();

        // KHÔNG kiểm tra 'c.from' ở đây nữa.

        const usedInPri = await this.priRepo.createQueryBuilder('pri')
            .where('pri.received_uom_code = :code', { code: u.code }).getCount();
        const usedInPrl = await this.prlRepo.createQueryBuilder('prl')
            .where('prl.uom_code = :code', { code: u.code }).getCount();
        const usedInIng = await this.ingRepo.createQueryBuilder('ing')
            .where('ing.selected_uom_code = :code', { code: u.code }).getCount();

        // Kiểm tra tổng hợp
        const isInUse = usedAsBase > 0 || usedInPri > 0 || usedInPrl > 0 || usedInIng > 0;

        if (isInUse) {
            // Soft delete: set inactive
            u.isActive = false;
            await this.uomRepo.save(u);
            return new ResponseCommon(200, true, 'UOM_DEACTIVATED', { code: u.code });
        } else {
            // Hard delete
            
            // --- SỬA ĐỔI 2: Dọn dẹp bảng Conversion trước khi xóa Unit ---
            
            // Nếu đơn vị này có định nghĩa quy đổi (nó là 'from'), hãy xóa định nghĩa đó đi trước.
            // Ví dụ: Xóa dòng "1 Thùng = 24 Lon" trong bảng conversion.
            await this.convRepo.delete({ from: { code: u.code } });

            // Sau đó mới xóa đơn vị tính
            await this.uomRepo.delete({ code: u.code });
            
            return new ResponseCommon(200, true, 'UOM_DELETED', { code: u.code });
        }
    }

    /**
     * Kiểm tra xem một UOM có đang được sử dụng ở đâu không.
     * Trả về số lần sử dụng theo từng bảng để UI quyết định khoá/Hệ số không cho sửa.
     */
    async checkUsage(code: string) {
        const u = await this.uomRepo.findOne({ where: { code: code.toUpperCase() } });
        if (!u) throw new ResponseException('UOM_NOT_FOUND', 404);

        // Chạy song song tất cả các câu lệnh đếm cùng lúc (Tổng thời gian = Thời gian của câu lệnh lâu nhất)
        const [usedInInv, usedInConv, usedInPri, usedInPrl, usedInIng] = await Promise.all([
            // 1. Check tồn kho — dùng query builder để tránh lỗi typing với nested relation props
            this.invRepo.createQueryBuilder('i')
                .where('i.base_uom_code = :code', { code: u.code }).getCount(),

            // 2. Check quy đổi (Logic OR của bạn)
            this.convRepo.createQueryBuilder('c')
                .leftJoin('c.from', 'f').leftJoin('c.to', 't')
                .where('f.code = :code OR t.code = :code', { code: u.code }).getCount(),

            // 3. Các check khác — dùng column names via query builder
            this.priRepo.createQueryBuilder('pri')
                .where('pri.received_uom_code = :code', { code: u.code }).getCount(),
            this.prlRepo.createQueryBuilder('prl')
                .where('prl.uom_code = :code', { code: u.code }).getCount(),
            this.ingRepo.createQueryBuilder('ing')
                .where('ing.selected_uom_code = :code', { code: u.code }).getCount(),
        ]);

        const total = usedInInv + usedInConv + usedInPri + usedInPrl + usedInIng;

        return new ResponseCommon(200, true, 'OK', {
            code: u.code,
            name: u.name,
            isActive: u.isActive,
            counts: {
                inventoryItems: usedInInv, // Trả về số này để FE biết tại sao bị khóa
                conversions: usedInConv,
                purchaseReceiptItems: usedInPri,
                purchaseReturnLogs: usedInPrl,
                ingredients: usedInIng,
            },
            // Chỉ cần tổng > 0 là coi như ĐÃ DÙNG -> Khóa edit
            isUsed: total > 0,
        });
    }

    async deactivate(code: string) {
        const u = await this.uomRepo.findOne({ where: { code: code.toUpperCase() } });
        if (!u) throw new ResponseException('UOM_NOT_FOUND', 404);
        if (!u.isActive) throw new ResponseException('UOM_ALREADY_INACTIVE', 400);
        u.isActive = false;
        await this.uomRepo.save(u);
        return new ResponseCommon(200, true, 'UOM_DEACTIVATED', { code: u.code });
    }

    async activate(code: string) {
        const u = await this.uomRepo.findOne({ where: { code: code.toUpperCase() } });
        if (!u) throw new ResponseException('UOM_NOT_FOUND', 404);
        if (u.isActive) throw new ResponseException('UOM_ALREADY_ACTIVE', 400);
        u.isActive = true;
        await this.uomRepo.save(u);
        return new ResponseCommon(200, true, 'UOM_ACTIVATED', { code: u.code });
    }

    async findByInventoryItem(inventoryItemId: string) {
        // 1. Lấy thông tin Item và Base Unit
        const inv = await this.invRepo.findOne({
            where: { id: inventoryItemId },
            relations: ['baseUom'],
        });
        if (!inv) {
            throw new ResponseException('INVENTORY_ITEM_NOT_FOUND', 404);
        }

        const baseCode = inv.baseUom.code;

        // 2. Logic tìm kiếm mở rộng (Graph Traversal - BFS)
        const allRelatedCodes = new Set<string>(); // Danh sách chứa kết quả cuối cùng
        allRelatedCodes.add(baseCode);

        let currentLayerCodes = [baseCode]; // Các code cần đi kiểm tra ở vòng lặp hiện tại

        while (currentLayerCodes.length > 0) {
            // Tìm tất cả các quy đổi dính líu đến layer hiện tại
            const foundConversions = await this.convRepo.find({
                where: [
                    { from: { code: In(currentLayerCodes) } },
                    { to: { code: In(currentLayerCodes) } },
                ],
                relations: ['from', 'to'],
            });

            // Reset layer tiếp theo
            const nextLayerCodes: string[] = [];

            for (const c of foundConversions) {
                // Kiểm tra fromCode: Nếu chưa có trong danh sách tổng -> Thêm vào danh sách tổng & danh sách cần kiểm tra tiếp
                if (!allRelatedCodes.has(c.from.code)) {
                    allRelatedCodes.add(c.from.code);
                    nextLayerCodes.push(c.from.code);
                }
                // Kiểm tra toCode tương tự
                if (!allRelatedCodes.has(c.to.code)) {
                    allRelatedCodes.add(c.to.code);
                    nextLayerCodes.push(c.to.code);
                }
            }

            // Gán danh sách mới tìm được để lặp tiếp. Nếu mảng này rỗng -> while dừng.
            currentLayerCodes = nextLayerCodes;
        }

        // 3. Query lấy thông tin chi tiết UOM từ danh sách code đã tìm được
        const uoms = await this.uomRepo.find({
            where: { code: In(Array.from(allRelatedCodes)) },
            order: { name: 'ASC' },
        });
        console.log('Found UOMs:', uoms);
        // 4. Map kết quả trả về
        return uoms.map(u => ({
            code: u.code,
            name: u.name,
            dimension: u.dimension,
            isBase: u.code === baseCode,
        }));
    }
}
