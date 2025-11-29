import { MenuItem } from '@modules/menuitems/entities/menuitem.entity';
import { Injectable } from '@nestjs/common';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { MenuComboItem } from './entities/menucomboitem.entity';
import { OrderItem } from '@modules/orderitems/entities/orderitem.entity';
import { OrderStatus, InvoiceStatus } from 'src/common/enums';
import { Category } from '@modules/category/entities/category.entity';
import { Invoice } from '@modules/invoice/entities/invoice.entity';
import { Payment } from '@modules/payments/entities/payment.entity';
import { UpdateComboDto } from './dto/update-combo.dto';
import { CreateComboDto } from './dto/create-combo.dto';
import { DataSource, In, Repository, Brackets } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigS3Service } from 'src/common/AWS/config-s3/config-s3.service';
import { ListCombosDto } from './dto/ListCombosDto.dto';

@Injectable()
export class MenucomboitemService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(MenuItem) private readonly menuRepo: Repository<MenuItem>,
    @InjectRepository(Category) private readonly catRepo: Repository<Category>,
    private readonly configS3Service: ConfigS3Service,
  ) { }

  // Create a new combo (nhận luôn file ảnh)
  async create(dto: CreateComboDto, file?: Express.Multer.File) {
    if (!dto.components?.length)
      return new ResponseCommon(400, false, 'COMPONENTS_REQUIRED');

    // 1) Upload ảnh nếu có file (giống menuitemsService)
    if (file) {
      const key = await this.configS3Service.uploadBuffer(file.buffer, file.mimetype, 'menu-combos');
      dto.image = this.configS3Service.makeS3Url(key);
    }

    // 2) Validate components
    const ids = dto.components.map(c => c.itemId);
    const unique = Array.from(new Set(ids));
    if (unique.length !== ids.length)
      return new ResponseCommon(400, false, 'DUPLICATE_COMPONENT_ITEM');

    const childItems = await this.menuRepo.find({
      where: { id: In(unique), isCombo: false },
    });
    if (childItems.length !== unique.length) {
      return new ResponseCommon(400, false, 'SOME_ITEMS_NOT_FOUND_OR_IS_COMBO');
    }

    // 3) Category (nullable)
    let category: Category | null = null;

    // 4) Transaction tạo combo + components
    return this.ds.transaction(async em => {
      const combo = em.create(MenuItem, {
        name: dto.name,
        price: dto.comboPrice,
        isCombo: true,
        description: dto.description,
        image: dto.image ?? null,
        isAvailable: dto.isAvailable ?? true,
        category: category ?? null,
      });
      await em.save(combo);

      const rows = dto.components.map(c => {
        const item = childItems.find(i => i.id === c.itemId)!;
        return em.create(MenuComboItem, { combo, item, quantity: c.quantity });
      });
      await em.save(rows);

      return em.getRepository(MenuItem).findOne({
        where: { id: combo.id },
        relations: { components: { item: { ingredients: { selectedUom: true, inventoryItem: true } } }, category: true },
      });
    });
  }


  /** List combos */
  async findAll(query: ListCombosDto) {
    try {
      let {
        q, categoryId, priceMin, priceMax,
        sortBy = 'name', sortDir = 'ASC', page = 1, limit = 10,
      } = query;

      page = Math.max(1, Number(page || 1));
      limit = Math.min(100, Math.max(1, Number(limit || 10)));

      const qb = this.menuRepo.createQueryBuilder('m')
        .leftJoinAndSelect('m.category', 'c')
        .where('m.isCombo = true');

      // search
      const kw = q?.trim();
      if (kw) {
        const s = `%${kw.toLowerCase()}%`;
        qb.andWhere('(LOWER(m.name) LIKE :s OR LOWER(c.name) LIKE :s)', { s });
      }

      if (categoryId) {
        qb.andWhere('c.id = :cid', { cid: categoryId });
      }
      if (typeof priceMin === 'number') qb.andWhere('m.price >= :pmin', { pmin: priceMin });
      if (typeof priceMax === 'number') qb.andWhere('m.price <= :pmax', { pmax: priceMax });

      const SORTABLE = new Set(['name', 'price', 'createdAt']);
      if (!SORTABLE.has(sortBy)) sortBy = 'name';
      sortDir = (String(sortDir).toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

      qb.orderBy(`m.${sortBy}`, sortDir as 'ASC' | 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [rows, total] = await qb.getManyAndCount();

      return new ResponseCommon(
        200,
        true,
        'Lấy danh sách combo thành công',
        rows,
        { total, page, limit, pages: Math.ceil(total / limit) || 0 },
      );
    } catch (error) {
      throw new ResponseException(error, 500, 'GET_COMBOS_FAILED');
    }
  }


  /** Get combo detail */
  async findOne(id: string) {
    const combo = await this.menuRepo.findOne({
      where: { id, isCombo: true },
      relations: { components: { item: { ingredients: { selectedUom: true, inventoryItem: true } } }, category: true },
    });
    if (!combo) return new ResponseCommon(404, false, 'COMBO_NOT_FOUND');
    return combo;
  }

  /** Update combo (replace components if provided) */
  async update(id: string, dto: UpdateComboDto, file?: Express.Multer.File) {
    const combo = await this.menuRepo.findOne({ where: { id, isCombo: true } });
    if (!combo) return new ResponseCommon(404, false, 'COMBO_NOT_FOUND');

    // Kiểm tra nếu có order "mở" đang dùng combo này thì không cho phép sửa
    const openStatuses = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.SERVED,
    ];
    // Chỉ tính các order còn "mở" VÀ chưa có invoice được thanh toán.
    // Một số luồng thanh toán có thể đã mark invoice = PAID nhưng chưa cập nhật order.status,
    // nên ta loại trừ các order có invoice.status = PAID để tránh block vô lý.
    // chỉ tính các order mở được tạo trong cùng ngày (ngày hiện tại của server)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);

    const inUseCount = await this.ds.getRepository(OrderItem)
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .leftJoin('o.invoice', 'inv')
      .where('oi.menuItemId = :mid', { mid: id })
      .andWhere('o.status IN (:...sts)', { sts: openStatuses })
      .andWhere('o.createdAt >= :from AND o.createdAt < :to', { from: todayStart, to: tomorrowStart })
      .andWhere(new Brackets(qb => {
        qb.where('inv.id IS NULL').orWhere('inv.status <> :paid', { paid: InvoiceStatus.PAID });
      }))
      .getCount();
    if (inUseCount > 0) {
      return new ResponseCommon(400, false, 'COMBO_IN_USE_BY_OPEN_ORDERS');
    }

    return this.ds.transaction(async em => {
      // 1) Xử lý cập nhật thông tin cơ bản
      if (dto.name !== undefined) combo.name = dto.name;
      if (dto.comboPrice !== undefined) combo.price = dto.comboPrice;
      if (dto.description !== undefined) combo.description = dto.description;
      if (dto.isAvailable !== undefined) combo.isAvailable = dto.isAvailable;

      // 3) Xử lý cập nhật ảnh (nếu có file)
      if (file) {
        const key = await this.configS3Service.uploadBuffer(file.buffer, file.mimetype, 'menu-combos');
        combo.image = this.configS3Service.makeS3Url(key);
      }

      await em.save(combo);

      // 4) Xử lý cập nhật components (nếu có)
      if (dto.components) {
        if (!dto.components.length) return new ResponseCommon(400, false, 'COMPONENTS_REQUIRED');

        const ids = dto.components.map(c => c.itemId);
        const unique = Array.from(new Set(ids));
        if (unique.length !== ids.length) return new ResponseCommon(400, false, 'DUPLICATE_COMPONENT_ITEM');

        const childItems = await em.getRepository(MenuItem).find({
          where: { id: In(unique), isCombo: false },
        });
        if (childItems.length !== unique.length) {
          return new ResponseCommon(400, false, 'SOME_ITEMS_NOT_FOUND_OR_IS_COMBO');
        }

        await em.delete(MenuComboItem, { combo: { id: combo.id } });
        const rows = dto.components.map(c => {
          const item = childItems.find(i => i.id === c.itemId)!;
          return em.create(MenuComboItem, { combo, item, quantity: c.quantity });
        });
        await em.save(rows);
      }

      // 5) Trả về combo đã cập nhật
      return em.getRepository(MenuItem).findOne({
        where: { id: combo.id },
        relations: { components: { item: { ingredients: { selectedUom: true, inventoryItem: true } } }, category: true },
      });
    });
  }

  /** Delete combo (components auto-removed via CASCADE) */
  async remove(id: string) {
    const combo = await this.menuRepo.findOne({ where: { id, isCombo: true } });
    if (!combo) return new ResponseCommon(404, false, 'COMBO_NOT_FOUND');
    // Kiểm tra đã có giao dịch/hóa đơn liên quan tới combo này chưa
    // Nếu đã có hóa đơn hoặc thanh toán -> chỉ ẩn (isAvailable = false)
    // Nếu chưa có hóa đơn nào -> cho phép xóa hoàn toàn

    // 1) Count invoices that are connected to orders containing this combo
    const invCount = await this.ds.getRepository(Invoice)
      .createQueryBuilder('inv')
      .innerJoin('inv.order', 'o')
      .innerJoin('o.items', 'oi')
      .where('oi."menuItemId" = :mid', { mid: id })
      .getCount();

    if (invCount > 0) {
      // Có hoá đơn liên quan -> ẩn combo
      combo.isAvailable = false;
      await this.menuRepo.save(combo);
      return new ResponseCommon(200, true, 'COMBO_HIDDEN', { id: combo.id, isAvailable: combo.isAvailable });
    }

    // 2) No invoices — safe to delete. (payments normally linked to invoices)
    await this.menuRepo.delete(combo.id);
    return new ResponseCommon(200, true, 'COMBO_DELETED', { id: combo.id });
  }

}