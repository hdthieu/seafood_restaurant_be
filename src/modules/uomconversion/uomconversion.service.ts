import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateUomconversionDto } from './dto/create-uomconversion.dto';
import { UpdateUomconversionDto } from './dto/update-uomconversion.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UomConversion } from './entities/uomconversion.entity';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { DeleteUomConversionDto } from './dto/delete-uomconversion.dto';

@Injectable()
export class UomconversionService {
    constructor(
        @InjectRepository(UomConversion)
        private readonly convRepo: Repository<UomConversion>,
        @InjectRepository(UnitsOfMeasure)
        private readonly uomRepo: Repository<UnitsOfMeasure>,
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

    async list(dto: { page?: number; limit?: number }) {
        const page = Math.max(1, Number(dto.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(dto.limit) || 50));
        const [rows, total] = await this.convRepo.findAndCount({
            relations: ['from', 'to'],
            order: { factor: 'ASC' },
            skip: (page - 1) * limit,
            take: limit,
        });
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
        await this.convRepo.delete({ id: c.id });
        return new ResponseCommon(200, true, 'DELETED', { fromCode, toCode });
    }
}
