import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateUomconversionDto } from './dto/create-uomconversion.dto';
import { UpdateUomconversionDto } from './dto/update-uomconversion.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UomConversion } from './entities/uomconversion.entity';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { PurchaseReturnLog } from '@modules/purchasereturn/entities/purchasereturnlog.entity';
import { Ingredient } from '@modules/ingredient/entities/ingredient.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { DeleteUomConversionDto } from './dto/delete-uomconversion.dto';

@Injectable()
export class UomconversionService {
    constructor(
        @InjectRepository(UomConversion)
        private readonly convRepo: Repository<UomConversion>,
        @InjectRepository(UnitsOfMeasure)
        private readonly uomRepo: Repository<UnitsOfMeasure>,
        @InjectRepository(PurchaseReceiptItem)
        private readonly priRepo: Repository<PurchaseReceiptItem>,
        @InjectRepository(PurchaseReturnLog)
        private readonly prlRepo: Repository<PurchaseReturnLog>,
        @InjectRepository(Ingredient)
        private readonly ingRepo: Repository<Ingredient>,
        @InjectRepository(InventoryItem)
        private readonly invRepo: Repository<InventoryItem>,
    ) { }

    async create(dto: CreateUomconversionDto) {
        try {
            const fromCode = (dto.fromCode || '').trim().toUpperCase();
            const toCode = (dto.toCode || '').trim().toUpperCase();
            const factor = Number(dto.factor);
            if (!fromCode || !toCode) throw new ResponseException('UOM_CODE_REQUIRED', 400);
            if (fromCode === toCode) throw new ResponseException('FROM_TO_MUST_DIFFER', 400);
            if (!(factor > 0)) throw new ResponseException('FACTOR_INVALID', 400);

            const from = await this.uomRepo.findOne({ where: { code: fromCode } });
            const to = await this.uomRepo.findOne({ where: { code: toCode } });
            if (!from || !to) throw new ResponseException('UOM_NOT_FOUND', 400);
            if (from.dimension !== to.dimension) throw new ResponseException('DIMENSION_MISMATCH', 400);

            const dup = await this.convRepo.findOne({ where: { from: { code: fromCode }, to: { code: toCode } }, relations: ['from', 'to'] });
            if (dup) throw new ResponseException('CONVERSION_EXISTS', 400);

            const c = this.convRepo.create({ from, to, factor });
            await this.convRepo.save(c);
            return new ResponseCommon(201, true, 'UOM_CONVERSION_CREATED', {
                id: c.id,
                fromCode: from.code,
                toCode: to.code,
                factor: Number(c.factor),
            });
        } catch (error) {
            throw new ResponseException(error, 400, 'UOM_CONVERSION_CREATE_FAILED');
        }
    }

    async list(dto: { page?: number; limit?: number; fromCode?: string; toCode?: string }) {
        const page = Math.max(1, Number(dto.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(dto.limit) || 50));

        const qb = this.convRepo.createQueryBuilder('c')
            .leftJoinAndSelect('c.from', 'from')
            .leftJoinAndSelect('c.to', 'to');

        if (dto.fromCode) {
            qb.andWhere('from.code = :fromCode', { fromCode: String(dto.fromCode).trim().toUpperCase() });
        }
        if (dto.toCode) {
            qb.andWhere('to.code = :toCode', { toCode: String(dto.toCode).trim().toUpperCase() });
        }

        qb.orderBy('c.factor', 'ASC')
            .skip((page - 1) * limit)
            .take(limit);

        const [rows, total] = await qb.getManyAndCount();
        const data = rows.map(r => ({ id: r.id, fromCode: r.from.code, toCode: r.to.code, factor: Number(r.factor) }));
        return new ResponseCommon(200, true, 'OK', data, {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 0,
        });
    }

    async update(dto: UpdateUomconversionDto) {
        try {
            const fromCode = (dto.fromCode || '').trim().toUpperCase();
            const toCode = (dto.toCode || '').trim().toUpperCase();
            const factor = Number(dto.factor);
            if (!fromCode || !toCode) throw new ResponseException('UOM_CODE_REQUIRED', 400);
            if (!(factor > 0)) throw new ResponseException('FACTOR_INVALID', 400);

            const c = await this.convRepo.findOne({ where: { from: { code: fromCode }, to: { code: toCode } }, relations: ['from', 'to'] });
            if (!c) throw new ResponseException('CONVERSION_NOT_FOUND', 404);

            // Không kiểm tra inventory.base_uom_code (baseCode) theo yêu cầu — chỉ kiểm tra các chỗ unit thực sự được chọn
            const usedInPri = await this.priRepo.createQueryBuilder('pri')
                .where('pri.received_uom_code = :from OR pri.received_uom_code = :to', { from: fromCode, to: toCode })
                .getCount();
            const usedInPrl = await this.prlRepo.createQueryBuilder('prl')
                .where('prl.uom_code = :from OR prl.uom_code = :to', { from: fromCode, to: toCode })
                .getCount();
            const usedInIng = await this.ingRepo.createQueryBuilder('ing')
                .where('ing.selected_uom_code = :from OR ing.selected_uom_code = :to', { from: fromCode, to: toCode })
                .getCount();

            if (usedInPri > 0 || usedInPrl > 0 || usedInIng > 0) {
                throw new ResponseException('UOM_IN_USE_CANNOT_UPDATE_CONVERSION', 400);
            }

            c.factor = factor;
            await this.convRepo.save(c);
            return new ResponseCommon(200, true, 'UPDATED', { fromCode, toCode, factor });
        } catch (error) {
            throw new ResponseException(error, 400, 'UOM_CONVERSION_UPDATE_FAILED');
        }
    }

    async remove(dto: DeleteUomConversionDto) {
        const fromCode = (dto.fromCode || '').trim().toUpperCase();
        const toCode = (dto.toCode || '').trim().toUpperCase();
        const c = await this.convRepo.findOne({ where: { from: { code: fromCode }, to: { code: toCode } }, relations: ['from', 'to'] });
        if (!c) throw new ResponseException('CONVERSION_NOT_FOUND', 404);
        // Nếu conversion này liên quan đến các đơn vị đã sử dụng thì không xóa cứng
        const usedInPri = await this.priRepo.createQueryBuilder('pri')
            .where('pri.received_uom_code = :from OR pri.received_uom_code = :to', { from: fromCode, to: toCode })
            .getCount();
        const usedInPrl = await this.prlRepo.createQueryBuilder('prl')
            .where('prl.uom_code = :from OR prl.uom_code = :to', { from: fromCode, to: toCode })
            .getCount();
        const usedInIng = await this.ingRepo.createQueryBuilder('ing')
            .where('ing.selected_uom_code = :from OR ing.selected_uom_code = :to', { from: fromCode, to: toCode })
            .getCount();

        if (usedInPri > 0 || usedInPrl > 0 || usedInIng > 0) {
            // nếu đang được dùng thì không xóa cứng — trả về lỗi yêu cầu tạo conversion mới
            throw new ResponseException('UOM_IN_USE_CANNOT_DELETE_CONVERSION', 400);
        }

        await this.convRepo.delete({ id: c.id });
        return new ResponseCommon(200, true, 'DELETED', { fromCode, toCode });
    }
}
