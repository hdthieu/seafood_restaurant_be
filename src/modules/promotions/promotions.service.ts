import { HttpStatus, Injectable } from '@nestjs/common';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Promotion } from './entities/promotion.entity';
import { Brackets, DataSource, DeepPartial, In, Repository } from 'typeorm';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { ApplyWith, AudienceScope, DiscountTypePromotion } from 'src/common/enums';
import { Category } from '@modules/category/entities/category.entity';
import { MenuItem } from '@modules/menuitems/entities/menuitem.entity';
import { ListPromotionsDto, PromotionStatusFilter } from './dto/list-promotions.dto';
@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion) private readonly promoRepo: Repository<Promotion>,
    @InjectRepository(Category) private readonly catRepo: Repository<Category>,
    @InjectRepository(MenuItem) private readonly itemRepo: Repository<MenuItem>,
    private readonly ds: DataSource,
  ) { }

  private async resolveRelations(dto: CreatePromotionDto | UpdatePromotionDto) {
    let categories: Category[] | undefined;
    let items: MenuItem[] | undefined;

    if (dto.applyWith === ApplyWith.CATEGORY) {
      if (!dto.categoryIds?.length) {
        throw new ResponseException(
          null,
          HttpStatus.BAD_REQUEST,
          'CATEGORY_IDS_REQUIRED_WHEN_APPLY_WITH_CATEGORY',
        );
      }
      categories = await this.catRepo.find({ where: { id: In(dto.categoryIds) } });
      if (categories.length !== dto.categoryIds.length) {
        throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'SOME_CATEGORY_IDS_NOT_FOUND');
      }
    }

    if (dto.applyWith === ApplyWith.ITEM) {
      if (!dto.itemIds?.length) {
        throw new ResponseException(
          null,
          HttpStatus.BAD_REQUEST,
          'ITEM_IDS_REQUIRED_WHEN_APPLY_WITH_ITEM',
        );
      }
      items = await this.itemRepo.find({ where: { id: In(dto.itemIds) } });
      if (items.length !== dto.itemIds.length) {
        throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'SOME_ITEM_IDS_NOT_FOUND');
      }
    }

    return { categories, items };
  }

  private businessValidate(dto: CreatePromotionDto | UpdatePromotionDto) {
    if (dto.endAt && new Date(dto.endAt) < new Date(dto.startAt)) {
      throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'END_AT_MUST_BE_GREATER_THAN_START_AT');
    }

    if (dto.discountTypePromotion === DiscountTypePromotion.PERCENT) {
      if (dto.discountValue < 0 || dto.discountValue > 100) {
        throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'DISCOUNT_VALUE_MUST_BE_BETWEEN_0_AND_100');
      }
      if (dto.maxDiscountAmount != null && dto.maxDiscountAmount < 0) {
        throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'MAX_DISCOUNT_AMOUNT_NEGATIVE');
      }
    } else {
      if (dto.discountValue < 0) {
        throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'DISCOUNT_VALUE_MUST_BE_POSITIVE');
      }
    }

    if (!dto.promotionCode) {
      throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'PROMOTION_CODE_REQUIRED');
    }
    if (!/^KM-.+$/i.test(dto.promotionCode)) {
      throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'PROMOTION_CODE_MUST_START_WITH_KM');
    }
  }

  private applyWithValidate(dto: { applyWith: ApplyWith; categoryIds?: string[]; itemIds?: string[] }) {
    const hasCats = !!dto.categoryIds?.length;
    const hasItems = !!dto.itemIds?.length;

    if (hasCats && hasItems) {
      throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'ONLY_ONE_OF_CATEGORY_IDS_OR_ITEM_IDS_ALLOWED');
    }

    if (dto.applyWith === ApplyWith.CATEGORY) {
      if (!hasCats) throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'CATEGORY_IDS_REQUIRED_WHEN_APPLY_WITH_CATEGORY');
    } else if (dto.applyWith === ApplyWith.ITEM) {
      if (!hasItems) throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'ITEM_IDS_REQUIRED_WHEN_APPLY_WITH_ITEM');
    } else {
      if (hasCats || hasItems) {
        throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'IDS_NOT_ALLOWED_WHEN_APPLY_WITH_ORDER');
      }
    }
  }

  async createPromotion(dto: CreatePromotionDto) {
    this.businessValidate(dto);
    this.applyWithValidate(dto);

    const normalizedCode = dto.promotionCode.trim().toUpperCase();
    // tuỳ nghiệp vụ: có thể không filter isDeleted để tránh reuse code
    const existed = await this.promoRepo.findOne({ where: { promotionCode: normalizedCode } });
    if (existed) throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'PROMOTION_CODE_ALREADY_EXISTS');

    const result = await this.ds.transaction(async (tm) => {
      const { categories, items } = await this.resolveRelations(dto);

      const entity = this.promoRepo.create({
        name: dto.name.trim(),
        discountTypePromotion: dto.discountTypePromotion,
        discountValue: dto.discountValue,
        maxDiscountAmount: dto.maxDiscountAmount ?? null,
        minOrderAmount: dto.minOrderAmount,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : null,
        applyWith: dto.applyWith,
        audienceRules: dto.audienceRules ?? null,
        promotionCode: normalizedCode,
        description: dto.description?.trim() || null,
        isActive: false,
        isDeleted: false,
        ...(categories ? { categories } : {}),
        ...(items ? { items } : {}),
      });

      const saved = await tm.getRepository(Promotion).save(entity);
      return saved;
    });

    return { message: 'CREATE_PROMOTION_SUCCESS', data: result };
  }

  async findAllPromotions(q: ListPromotionsDto) {
    try {
      let {
        page = 1,
        limit = 10,
        includeDeleted = false,
        search, q: q2,
        isActive,
        sortBy = 'createdAt',
        sortDir = 'DESC',
      } = q;

      // Chuẩn hóa page/limit
      page = Math.max(1, Number(page || 1));
      limit = Math.min(100, Math.max(1, Number(limit || 10)));

      // Whitelist sortBy để tránh SQL injection field name
      const SORTABLE_FIELDS = new Set(['createdAt', 'updatedAt', 'startAt', 'endAt', 'name', 'promotionCode', 'isActive']);
      if (!SORTABLE_FIELDS.has(sortBy)) sortBy = 'createdAt';
      sortDir = (String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC');

      const keyword = (search ?? q2)?.trim();

      const qb = this.promoRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.categories', 'c')
        .leftJoinAndSelect('p.items', 'i');

      if (!includeDeleted) qb.andWhere('p.isDeleted = false');

      if (keyword) {
        const kw = `%${keyword.toLowerCase()}%`;
        qb.andWhere('(LOWER(p.name) LIKE :kw OR LOWER(p.promotionCode) LIKE :kw)', { kw });
      }

      if (typeof isActive === 'boolean') {
        qb.andWhere('p.isActive = :ia', { ia: isActive });
      }

      qb.orderBy(`p.${sortBy}`, sortDir as 'ASC' | 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [items, total] = await qb.getManyAndCount();

      return new ResponseCommon(
        200,
        true,
        'Lấy danh sách khuyến mãi thành công',
        items,
        {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 0,
        }
      );
    } catch (error) {
      throw new ResponseException(error, 500, 'Không thể lấy danh sách khuyến mãi');
    }
  }


  async findPromotionById(id: string, includeDeleted = false) {
    const promotion = await this.promoRepo.findOne({
      where: includeDeleted ? { id } : { id, isDeleted: false },
      relations: ['categories', 'items'],
    });
    if (!promotion) throw new ResponseException(null, HttpStatus.NOT_FOUND, 'PROMOTION_NOT_FOUND');

    return { message: 'GET_PROMOTION_SUCCESS', data: promotion };
  }


  async updatePromotion(id: string, dto: UpdatePromotionDto) {
    const promotion = await this.promoRepo.findOne({ where: { id }, relations: ['categories', 'items'] });
    if (!promotion) throw new ResponseException(null, HttpStatus.NOT_FOUND, 'PROMOTION_NOT_FOUND');

    this.businessValidate(dto);
    this.applyWithValidate(dto);

    const normalizedCode = dto.promotionCode.trim().toUpperCase();
    if (normalizedCode !== promotion.promotionCode) {
      const existed = await this.promoRepo.findOne({ where: { promotionCode: normalizedCode } });
      if (existed) throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'PROMOTION_CODE_ALREADY_EXISTS');
    }

    const result = await this.ds.transaction(async (tm) => {
      const { categories, items } = await this.resolveRelations(dto);

      // 1) update các field cơ bản
      const merged = this.promoRepo.merge(promotion, {
        name: dto.name.trim(),
        discountTypePromotion: dto.discountTypePromotion,
        discountValue: dto.discountValue,
        maxDiscountAmount: dto.maxDiscountAmount ?? null,
        minOrderAmount: dto.minOrderAmount ?? null,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : null,
        applyWith: dto.applyWith,
        audienceRules: dto.audienceRules ?? null,
        promotionCode: normalizedCode,
        description: dto.description?.trim() || null,
      });
      await tm.getRepository(Promotion).save(merged);

      // 2) set lại quan hệ ManyToMany bằng save({ id, ... })
      if (dto.applyWith === ApplyWith.CATEGORY) {
        await tm.getRepository(Promotion).save({
          id,
          categories: categories ?? [],
          items: [],                // clear items
        });
      } else if (dto.applyWith === ApplyWith.ITEM) {
        await tm.getRepository(Promotion).save({
          id,
          categories: [],
          items: items ?? [],
        });
      } else {
        await tm.getRepository(Promotion).save({
          id,
          categories: [],
          items: [],
        });
      }
      // 3) trả lại entity đã load đầy đủ relations
      const saved = await tm.getRepository(Promotion).findOne({
        where: { id },
        relations: ['categories', 'items'],
      });
      return saved!;
    });


    return { message: 'UPDATE_PROMOTION_SUCCESS', data: result };
  }

  async activatePromotion(id: string, isActive: boolean) {
    const promotion = await this.promoRepo.findOne({ where: { id, isDeleted: false } });
    if (!promotion) throw new ResponseException(null, HttpStatus.NOT_FOUND, 'PROMOTION_NOT_FOUND');

    if (isActive) {
      const now = new Date();
      if (promotion.startAt && now < promotion.startAt) {
        throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'PROMOTION_NOT_STARTED_YET');
      }
      if (promotion.endAt && now > promotion.endAt) {
        throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'PROMOTION_ALREADY_EXPIRED');
      }
    }

    promotion.isActive = isActive;
    const updated = await this.promoRepo.save(promotion);

    return {
      message: isActive ? 'PROMOTION_ACTIVATED_SUCCESS' : 'PROMOTION_DEACTIVATED_SUCCESS',
      data: updated,
    };
  }

  async softDeletePromotion(id: string) {
    const promotion = await this.promoRepo.findOne({ where: { id, isDeleted: false } });
    if (!promotion) throw new ResponseException(null, HttpStatus.NOT_FOUND, 'PROMOTION_NOT_FOUND');

    if (promotion.isActive) {
      throw new ResponseException(null, HttpStatus.BAD_REQUEST, 'PROMOTION_MUST_BE_DEACTIVATED_BEFORE_DELETE');
    }

    promotion.isDeleted = true;
    await this.promoRepo.save(promotion);

    return { message: 'DELETE_PROMOTION_SUCCESS', data: null };
  }

  async restorePromotion(id: string) {
    const promotion = await this.promoRepo.findOne({ where: { id, isDeleted: true } });
    if (!promotion) throw new ResponseException(null, HttpStatus.NOT_FOUND, 'PROMOTION_NOT_FOUND_OR_NOT_DELETED');

    promotion.isDeleted = false;
    await this.promoRepo.save(promotion);

    return { message: 'RESTORE_PROMOTION_SUCCESS', data: promotion };
  }
}