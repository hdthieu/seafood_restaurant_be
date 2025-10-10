import { Injectable } from '@nestjs/common';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { DataSource, DeepPartial, In, Repository } from 'typeorm';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { ApplyWith, AudienceScope, DiscountTypePromotion } from 'src/common/enums';
import { Category } from '@modules/category/entities/category.entity';
import { MenuItem } from '@modules/menuitems/entities/menuitem.entity';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promoRepo: Repository<Promotion>,

    @InjectRepository(Category)
    private readonly catRepo: Repository<Category>,

    @InjectRepository(MenuItem)
    private readonly itemRepo: Repository<MenuItem>,

    private readonly ds: DataSource
  ) { }

  private async resolveRelations(dto: CreatePromotionDto | UpdatePromotionDto) {
    let categories: Category[] | undefined;
    let items: MenuItem[] | undefined;

    if (dto.applyWith === ApplyWith.CATEGORY) {
      if (!dto.categoryIds?.length) {
        throw new ResponseCommon(400, false, 'CATEGORY scope requires categoryIds');
      }
      categories = await this.catRepo.find({ where: { id: In(dto.categoryIds) } });
      if (categories.length !== dto.categoryIds.length) {
        throw new ResponseCommon(400, false, 'Some categoryIds not found');
      }
    }

    if (dto.applyWith === ApplyWith.ITEM) {
      if (!dto.itemIds?.length) {
        throw new ResponseCommon(400, false, 'ITEM scope requires itemIds');
      }
      items = await this.itemRepo.find({ where: { id: In(dto.itemIds) } });
      if (items.length !== dto.itemIds.length) {
        throw new ResponseCommon(400, false, 'Some itemIds not found');
      }
    }

    return { categories, items };
  }

  private businessValidate(dto: CreatePromotionDto | UpdatePromotionDto) {
    if (dto.endAt && new Date(dto.endAt) < new Date(dto.startAt)) {
      throw new ResponseCommon(400, false, 'END_AT_MUST_BE_GREATER_THAN_START_AT');
    }
    if (dto.discountTypePromotion === DiscountTypePromotion.PERCENT) {
      if (dto.discountValue < 0 || dto.discountValue > 100) {
        throw new ResponseCommon(400, false, 'DISCOUNT_VALUE_MUST_BE_BETWEEN_0_AND_100');
      }
      if (dto.maxDiscountAmount != null && dto.maxDiscountAmount < 0) {
        throw new ResponseCommon(400, false, 'MAX_DISCOUNT_AMOUNT_NEGATIVE');
      }
    } else {
      if (dto.discountValue < 0) {
        throw new ResponseCommon(400, false, 'DISCOUNT_VALUE_MUST_BE_POSITIVE');
      }
    }

    // KHÔNG còn codeRequired
    if (!dto.promotionCode) {
      throw new ResponseCommon(400, false, 'PROMOTION_CODE_REQUIRED');
    }
    if (!/^KM-.+$/i.test(dto.promotionCode)) {
      throw new ResponseCommon(400, false, 'PROMOTION_CODE_MUST_START_WITH_KM');
    }
  }

  private applyWithValidate(dto: { applyWith: ApplyWith; categoryIds?: string[]; itemIds?: string[] }) {
    if (dto.applyWith === ApplyWith.CATEGORY && !(dto.categoryIds?.length)) {
      throw new ResponseCommon(400, false, 'CATEGORY_IDS_REQUIRED_WHEN_APPLY_WITH_CATEGORY');
    }
    if (dto.applyWith === ApplyWith.ITEM && !(dto.itemIds?.length)) {
      throw new ResponseCommon(400, false, 'ITEM_IDS_REQUIRED_WHEN_APPLY_WITH_ITEM');
    }
  }

  async createPromotion(dto: CreatePromotionDto) {
    this.businessValidate(dto);
    this.applyWithValidate(dto);

    // chuẩn hoá mã (ví dụ upper case)
    const normalizedCode = dto.promotionCode.trim().toUpperCase();

    // check trùng
    const existed = await this.promoRepo.findOne({ where: { promotionCode: normalizedCode } });
    if (existed) {
      return new ResponseCommon(400, false, 'PROMOTION_CODE_ALREADY_EXISTS');
    }

    try {
      const result = await this.ds.transaction(async (tm) => {
        const { categories, items } = await this.resolveRelations(dto);

        const entity = this.promoRepo.create({
          name: dto.name,
          discountTypePromotion: dto.discountTypePromotion,
          discountValue: dto.discountValue,
          maxDiscountAmount: dto.maxDiscountAmount ?? null,
          minOrderAmount: dto.minOrderAmount,
          startAt: new Date(dto.startAt),
          endAt: dto.endAt ? new Date(dto.endAt) : null,
          applyWith: dto.applyWith,
          audienceRules: dto.audienceRules ?? null,
          promotionCode: normalizedCode,
          isActive: false,
          ...(categories ? { categories } : {}),
          ...(items ? { items } : {}),
        });

        const saved = await tm.getRepository(Promotion).save(entity);
        return saved;
      });

      return new ResponseCommon(201, true, 'CREATE_PROMOTION_SUCCESS', result);
    } catch (e) {
      throw e;
    }
  }

  async findAllPromotions(qry: { page?: number; limit?: number }) {
    const { page = 1, limit = 10 } = qry;

    const [promos, total] = await this.promoRepo.findAndCount({
      order: { createdAt: 'DESC' },
      relations: ['categories', 'items'],
      skip: (page - 1) * limit,
      take: Math.min(Number(limit) || 20, 100),
    });

    return new ResponseCommon(200, true, 'GET_PROMOTIONS_SUCCESS', {
      items: promos,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  }
  async findPromotionById(id: string) {
    try {
      const promotion = await this.promoRepo.findOne({
        where: { id },
        relations: ['categories', 'items'],
      });

      if (!promotion) {
        return new ResponseCommon(404, false, 'PROMOTION_NOT_FOUND');
      }

      return new ResponseCommon(200, true, 'GET_PROMOTION_SUCCESS', promotion);
    } catch (error) {
      throw new ResponseCommon(500, false, 'INTERNAL_SERVER_ERROR', null, error.message);
    }
  }

  async updatePromotion(id: string, dto: UpdatePromotionDto) {
    // Kiểm tra xem khuyến mãi có tồn tại không
    const promotion = await this.promoRepo.findOne({ where: { id } });
    if (!promotion) {
      return new ResponseCommon(404, false, 'PROMOTION_NOT_FOUND');
    }

    // Kiểm tra tính hợp lệ của dữ liệu
    this.businessValidate(dto);
    this.applyWithValidate(dto);

    // Chuẩn hóa mã khuyến mãi
    const normalizedCode = dto.promotionCode.trim().toUpperCase();

    // Kiểm tra trùng mã khuyến mãi (nếu mã mới khác mã cũ)
    if (normalizedCode !== promotion.promotionCode) {
      const existed = await this.promoRepo.findOne({ where: { promotionCode: normalizedCode } });
      if (existed) {
        return new ResponseCommon(400, false, 'PROMOTION_CODE_ALREADY_EXISTS');
      }
    }

    try {
      const result = await this.ds.transaction(async (tm) => {
        const { categories, items } = await this.resolveRelations(dto);

        // Cập nhật thông tin khuyến mãi
        const updated = this.promoRepo.merge(promotion, {
          name: dto.name,
          discountTypePromotion: dto.discountTypePromotion,
          discountValue: dto.discountValue,
          maxDiscountAmount: dto.maxDiscountAmount ?? null,
          minOrderAmount: dto.minOrderAmount,
          startAt: new Date(dto.startAt),
          endAt: dto.endAt ? new Date(dto.endAt) : null,
          applyWith: dto.applyWith,
          audienceRules: dto.audienceRules ?? null,
          promotionCode: normalizedCode,
          ...(categories ? { categories } : {}),
          ...(items ? { items } : {}),
        });

        const saved = await tm.getRepository(Promotion).save(updated);
        return saved;
      });

      return new ResponseCommon(200, true, 'UPDATE_PROMOTION_SUCCESS', result);
    } catch (e) {
      throw e;
    }
  }

  async activatePromotion(id: string, isActive: boolean) {
    // Kiểm tra xem khuyến mãi có tồn tại không
    const promotion = await this.promoRepo.findOne({ where: { id } });
    if (!promotion) {
      return new ResponseCommon(404, false, 'PROMOTION_NOT_FOUND');
    }

    // Cập nhật trạng thái kích hoạt
    promotion.isActive = isActive;

    try {
      const updated = await this.promoRepo.save(promotion);
      return new ResponseCommon(
        200,
        true,
        isActive ? 'PROMOTION_ACTIVATED_SUCCESS' : 'PROMOTION_DEACTIVATED_SUCCESS',
        updated,
      );
    } catch (e) {
      throw new ResponseCommon(500, false, 'INTERNAL_SERVER_ERROR', null, e.message);
    }
  }
}