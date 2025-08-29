import { Injectable } from '@nestjs/common';
import { CreateInventoryitemDto } from './dto/create-inventoryitem.dto';
import { UpdateInventoryitemDto } from './dto/update-inventoryitem.dto';
import { InventoryItem } from './entities/inventoryitem.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class InventoryitemsService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly inventoryRepo: Repository<InventoryItem>,
  ) { }

  async create(dto: CreateInventoryitemDto): Promise<InventoryItem> {
    const item = this.inventoryRepo.create(dto);
    return this.inventoryRepo.save(item);
  }

  async findAll(): Promise<InventoryItem[]> {
    return this.inventoryRepo.find();
  }
}
