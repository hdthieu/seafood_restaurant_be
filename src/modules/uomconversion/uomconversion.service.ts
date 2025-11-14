import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateUomconversionDto } from './dto/create-uomconversion.dto';
import { UpdateUomconversionDto } from './dto/update-uomconversion.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UomConversion } from './entities/uomconversion.entity';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';

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
            if (!fromCode || !toCode) throw new BadRequestException('UOM_CODE_REQUIRED');
            if (fromCode === toCode) throw new BadRequestException('FROM_TO_MUST_DIFFER');
            if (!(factor > 0)) throw new BadRequestException('FACTOR_INVALID');

            const from = await this.uomRepo.findOne({ where: { code: fromCode } });
            const to = await this.uomRepo.findOne({ where: { code: toCode } });
            if (!from || !to) throw new BadRequestException('UOM_NOT_FOUND');
            if (from.dimension !== to.dimension) throw new BadRequestException('DIMENSION_MISMATCH');

            const dup = await this.convRepo.findOne({ where: { from: { code: fromCode }, to: { code: toCode } }, relations: ['from', 'to'] });
            if (dup) throw new BadRequestException('CONVERSION_EXISTS');

            const c = this.convRepo.create({ from, to, factor });
            await this.convRepo.save(c);
            return new ResponseCommon(201, true, 'Tạo quy đổi UOM thành công', {
                id: c.id,
                fromCode: from.code,
                toCode: to.code,
                factor: Number(c.factor),
            });
        } catch (error) {
            throw new ResponseException(error, 400, 'Không thể tạo quy đổi UOM');
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
}
