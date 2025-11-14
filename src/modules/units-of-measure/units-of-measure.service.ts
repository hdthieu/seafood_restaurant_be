import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateUnitsOfMeasureDto } from './dto/create-units-of-measure.dto';
import { UpdateUnitsOfMeasureDto } from './dto/update-units-of-measure.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitsOfMeasure } from './entities/units-of-measure.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';

@Injectable()
export class UnitsOfMeasureService {
    constructor(
        @InjectRepository(UnitsOfMeasure)
        private readonly uomRepo: Repository<UnitsOfMeasure>,
    ) { }

    async create(dto: CreateUnitsOfMeasureDto) {
        try {
            const code = (dto.code || '').trim().toUpperCase();
            const name = (dto.name || '').trim();
            const dimension = dto.dimension;
            if (!code) throw new BadRequestException('CODE_REQUIRED');
            if (!name) throw new BadRequestException('NAME_REQUIRED');

            const exists = await this.uomRepo.findOne({ where: { code } });
            if (exists) throw new BadRequestException('UOM_CODE_EXISTS');

            const u = this.uomRepo.create({ code, name, dimension });
            await this.uomRepo.save(u);
            return new ResponseCommon(201, true, 'Tạo UOM thành công', u);
        } catch (error) {
            throw new ResponseException(error, 400, 'Không thể tạo UOM');
        }
    }

    async list(dto: { page?: number; limit?: number }) {
        const page = Math.max(1, Number(dto.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(dto.limit) || 20));
        const [rows, total] = await this.uomRepo.findAndCount({
            order: { code: 'ASC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return new ResponseCommon(200, true, 'OK', rows, {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 0,
        });
    }

}
