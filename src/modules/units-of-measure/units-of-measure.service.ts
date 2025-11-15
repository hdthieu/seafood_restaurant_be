import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateUnitsOfMeasureDto } from './dto/create-units-of-measure.dto';
import { UpdateUnitsOfMeasureDto } from './dto/update-units-of-measure.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitsOfMeasure } from './entities/units-of-measure.entity';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
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
    ) { }

    async create(dto: CreateUnitsOfMeasureDto) {
        const code = (dto.code || '').trim().toUpperCase();
        const name = (dto.name || '').trim();
        const dimension = dto.dimension;
        if (!code) throw new ResponseException('UOM_CODE_REQUIRED', 400);
        if (!name) throw new ResponseException('UOM_NAME_REQUIRED', 400);

        const exists = await this.uomRepo.findOne({ where: { code } });
        if (exists) throw new ResponseException('UOM_CODE_EXISTS', 400);
        const u = this.uomRepo.create({ code, name, dimension });
        await this.uomRepo.save(u);
        return new ResponseCommon(201, true, 'UOM_CREATED', u);
    }

    async list(dto: ListUnitsOfMeasureQueryDto) {
        const page = Math.max(1, Number(dto.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(dto.limit) || 20));
        const qb = this.uomRepo.createQueryBuilder('u');

        if (dto.code) qb.andWhere('u.code = :code', { code: dto.code.toUpperCase().trim() });
        if (dto.name) qb.andWhere('u.name ILIKE :name', { name: `%${dto.name.trim()}%` });
        if (dto.dimension) qb.andWhere('u.dimension = :dimension', { dimension: dto.dimension });
        if (dto.q) qb.andWhere('(u.code ILIKE :q OR u.name ILIKE :q)', { q: `%${dto.q.trim()}%` });

        const sortBy = (dto.sortBy || 'code');
        const sortDir = ((dto.sortDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC');
        qb.orderBy(`u.${sortBy}`, sortDir as any);

        qb.skip((page - 1) * limit).take(limit);
        const [rows, total] = await qb.getManyAndCount();
        return new ResponseCommon(200, true, 'OK', rows, {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 0,
        });
    }

    async getOne(code: string) {
        const u = await this.uomRepo.findOne({ where: { code: code.toUpperCase() } });
        if (!u) throw new ResponseException('UOM_NOT_FOUND', 404);
        return new ResponseCommon(200, true, 'OK', u);
    }

    async update(code: string, dto: UpdateUnitsOfMeasureDto) {
        const u = await this.uomRepo.findOne({ where: { code: code.toUpperCase() } });
        if (!u) throw new ResponseException('UOM_NOT_FOUND', 404);
        const nextName = (dto.name ?? u.name).trim();
        const nextDim = (dto.dimension ?? u.dimension) as any;
        if (dto.dimension && dto.dimension !== u.dimension) {
            const usedInInv = await this.invRepo.createQueryBuilder('i')
                .where('i.base_uom_code = :code', { code: u.code }).getCount();
            const usedInConv = await this.convRepo.createQueryBuilder('c')
                .leftJoin('c.from', 'f').leftJoin('c.to', 't')
                .where('f.code = :code OR t.code = :code', { code: u.code }).getCount();
            if (usedInInv > 0 || usedInConv > 0) throw new ResponseException('UOM_IN_USE_CANNOT_CHANGE_DIMENSION', 400);
        }

        u.name = nextName;
        u.dimension = nextDim;
        await this.uomRepo.save(u);
        return new ResponseCommon(200, true, 'UPDATED', u);
    }

    async remove(code: string) {
        const u = await this.uomRepo.findOne({ where: { code: code.toUpperCase() } });
        if (!u) throw new ResponseException('UOM_NOT_FOUND', 404);
        const usedInInv = await this.invRepo.createQueryBuilder('i')
            .where('i.base_uom_code = :code', { code: u.code }).getCount();
        const usedInConv = await this.convRepo.createQueryBuilder('c')
            .leftJoin('c.from', 'f').leftJoin('c.to', 't')
            .where('f.code = :code OR t.code = :code', { code: u.code }).getCount();
        if (usedInInv > 0 || usedInConv > 0) throw new ResponseException('UOM_IN_USE_CANNOT_DELETE', 400);
        await this.uomRepo.delete({ code: u.code });
        return new ResponseCommon(200, true, 'DELETED', { code: u.code });
    }

}
