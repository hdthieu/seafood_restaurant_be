import { Injectable } from '@nestjs/common';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { Repository } from 'typeorm';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { ApplyWith, DiscountTypePromotion } from 'src/common/enums';

@Injectable()
export class PromotionsService {
  constructor(@InjectRepository(Promotion)
  private readonly repo: Repository<Promotion>) { }

  private validateBusiness(dto: CreatePromotionDto) {
    // 1) validate ngày
    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (Number.isNaN(startAt.getTime())) throw new ResponseCommon(400, false, 'startAt is invalid ISO date', null);
    if (endAt && Number.isNaN(endAt.getTime())) throw new ResponseCommon(400, false, 'endAt is invalid ISO date', null);
    if (endAt && endAt < startAt) throw new ResponseCommon(400, false, 'endAt must be greater than or equal to startAt', null);

    // 2) validate % giảm
    if (dto.discountTypePromotion === DiscountTypePromotion.PERCENT) {
      if (dto.discountValue <= 0 || dto.discountValue > 100) {
        throw new ResponseCommon(400, false, 'discountValue (PERCENT) must be > 0 and <= 100', null);
      }
    } else {
      // AMOUNT
      if (dto.discountValue <= 0) {
        throw new ResponseCommon(400, false, 'discountValue (AMOUNT) must be > 0', null);
      }
    }

    // 3) validate targets theo applyWith
    if (dto.applyWith !== ApplyWith.ORDER) {
      if (!dto.targets || !Array.isArray(dto.targets) || dto.targets.length === 0) {
        throw new ResponseCommon(400, false, 'targets must be provided when applyWith is not ORDER', null);
      }
    }

    // 4) min order
    if (dto.minOrderAmount < 0) {
      throw new ResponseCommon(400, false, 'minOrderAmount must be >= 0', null);
    }

    return { startAt, endAt };
  }

  async create(dto: CreatePromotionDto) {
    const { startAt, endAt } = this.validateBusiness(dto);

    // (tuỳ chọn) chống trùng tên trong cùng khung giờ hoạt động
    const exists = await this.repo.findOne({ where: { name: dto.name.trim(), isActive: true } });
    if (exists) throw new ResponseCommon(400, false, 'name is exists', null);

    const entity = this.repo.create({
      name: dto.name.trim(),
      discountTypePromotion: dto.discountTypePromotion,
      discountValue: dto.discountValue,
      maxDiscountAmount: dto.maxDiscountAmount ?? null,
      minOrderAmount: dto.minOrderAmount,
      startAt,
      endAt,
      applyWith: dto.applyWith,
      targets: dto.targets ?? null,
      rules: dto.rules ?? null,
      isActive: dto.isActive ?? true,
      stackable: dto.stackable ?? false,
      description: dto.description ?? null,
    });

    return await this.repo.save(entity);
  }
}
