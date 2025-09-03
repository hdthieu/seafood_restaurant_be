import { Injectable } from '@nestjs/common';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Area } from './entities/area.entity';
import { Repository } from 'typeorm';
import { AreaStatus } from 'src/common/enums';
import { ResponseException } from 'src/common/common_dto/respone.dto';

@Injectable()
export class AreaService {

    constructor(
        @InjectRepository(Area)
        private readonly areaRepo: Repository<Area>,
    ) { }

    async createArea(dto: CreateAreaDto): Promise<Area> {
        const area = this.areaRepo.create({
            ...dto,
            status: dto.status || AreaStatus.AVAILABLE,
        });
        return this.areaRepo.save(area);
    }

    async getInfoArea(dto: any): Promise<Area[]> {
        const query = this.areaRepo
            .createQueryBuilder('area')
            .leftJoinAndSelect('area.tables', 'table');

        if (dto?.name) {
            query.andWhere('LOWER(area.name) LIKE LOWER(:name)', {
                name: `%${dto.name}%`,
            });
        }

        if (dto?.status) {
            query.andWhere('area.status = :status', { status: dto.status });
        }

        return query.getMany();
    }

    async getAreaIdByName(name: string): Promise<{ id: string }> {
        const area = await this.areaRepo.findOne({
            where: { name },
            select: ['id'],
        });

        if (!area) {
            throw new ResponseException('Khu vực không tồn tại', 404);
        }

        return { id: area.id };
    }


}
