import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RestaurantTable } from './entities/restauranttable.entity';
import { Repository } from 'typeorm';
import { Area } from '../area/entities/area.entity';
import { CreateRestaurantTableDto } from './dto/create-restauranttable.dto';
import { ResponseException } from 'src/common/common_dto/respone.dto';
import { TableStatus } from 'src/common/enums';

@Injectable()
export class RestaurantTablesService {
    constructor(
        @InjectRepository(RestaurantTable)
        private readonly tableRepo: Repository<RestaurantTable>,
        @InjectRepository(Area)
        private readonly areaRepo: Repository<Area>,
    ) { }

    async create(createDto: CreateRestaurantTableDto): Promise<RestaurantTable> {
        // 1. Kiểm tra tên bàn đã tồn tại chưa
        const existed = await this.tableRepo.findOne({
            where: {
                name: createDto.name,
                area: { id: createDto.areaId },
            },
        });

        if (existed) {
            throw new ResponseException('Bàn đã tồn tại', 400);
        }

        // 2. Kiểm tra areaId có tồn tại không
        const area = await this.areaRepo.findOne({ where: { id: createDto.areaId } });
        if (!area) {
            throw new ResponseException('Khu vực không tồn tại', 400);
        }

        // 3. Tạo mới bàn
        const newTable = this.tableRepo.create({
            name: createDto.name,
            seats: createDto.seats ?? 4,
            note: createDto.note,
            status: createDto.status ?? TableStatus.ACTIVE,
            area,
        });

        return this.tableRepo.save(newTable);
    }
}
