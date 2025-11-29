import { Injectable } from '@nestjs/common';
import { CashbookEntry } from './entities/cashbook.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DeepPartial, EntityManager, ILike, Repository } from 'typeorm';
import { CashType } from './entities/cash_types.entity';
import { Invoice } from '@modules/invoice/entities/invoice.entity';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { CreateCashbookEntryDto } from './dto/create-cashbook.dto';
import { ListCashTypeDto } from './dto/list-cash-type.dto';
import { CashbookType, CounterpartyGroup, ReceiptStatus } from 'src/common/enums';
import { Customer } from '@modules/customers/entities/customers.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { CashOtherParty } from './entities/cash_other_party';
import { PageMeta } from 'src/common/common_dto/paginated';
import { CreateCashOtherPartyDto } from './dto/create-cash-other-party.dto';
import { ListCashOtherPartyDto } from './dto/list-cash-other-party.dto';
import { UpdateCashOtherPartyDto } from './dto/update-cash-other-party.dto';
import { ListCashbookEntryDto } from './dto/list-cashbook.dto';
import { CreateCashTypeDto } from './dto/create-cash-type.dto';
import { User } from '@modules/user/entities/user.entity';
import { calcReceiptTotals } from '@modules/helper/purchasereceipthelper.service';
import { PurchaseReturn } from '@modules/purchasereturn/entities/purchasereturn.entity';
@Injectable()
export class CashbookService {
  constructor(
    @InjectRepository(CashbookEntry) private readonly repo: Repository<CashbookEntry>,
    @InjectRepository(CashType) private readonly typeRepo: Repository<CashType>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(PurchaseReceipt) private readonly prRepo: Repository<PurchaseReceipt>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<any>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<any>,
    @InjectRepository(CashOtherParty) private readonly otherPartyRepo: Repository<any>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(PurchaseReturn) private readonly returnRepo: Repository<PurchaseReturn>,
  ) { }

  private genCode(prefix: 'PT' | 'PC') {
    const d = new Date();
    const ymd = d.toISOString().slice(0, 19).replace(/\D/g, '');
    return `${prefix}-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private async getOrCreateType(em: EntityManager, name: string, isIncome: boolean) {
    const repo = em.getRepository(CashType);
    let t = await repo.findOne({ where: { name } });
    if (!t) t = await repo.save(repo.create({ name, isIncomeType: isIncome, isActive: true }));
    return t;
  }

  /** Thu tiền KH cho hóa đơn (CASH) – gọi TRONG transaction của InvoiceService */
  async postReceiptFromInvoice(em: EntityManager, inv: Invoice, amount: number) {
    if (!amount || amount <= 0) return;

    const type = await this.getOrCreateType(em, 'Thu tiền khách trả', true);
    const customerRef =
      (inv as any)?.customer?.id
        ? { id: (inv as any).customer.id }
        : (inv as any)?.customer_id
          ? { id: (inv as any).customer_id }
          : null;

    const entry = em.getRepository(CashbookEntry).create({
      type: CashbookType.RECEIPT,
      code: this.genCode('PT'),
      date: new Date(),
      cashType: type,
      amount: String(amount),
      counterpartyGroup: CounterpartyGroup.CUSTOMER,
      customer: customerRef as any,
      invoice: { id: (inv as any).id } as any,
      sourceCode: (inv as any)?.invoiceNumber ?? null,
    });

    await em.getRepository(CashbookEntry).save(entry);
    return entry;
  }

  /**
   * Thu tiền từ nhà cung cấp khi xử lý trả hàng (ví dụ: NCC hoàn tiền cho chúng ta).
   * Thin wrapper, dùng trong cùng transaction của PurchaseReturnService.
   */
  async postReceiptFromPurchaseReturn(em: EntityManager, pr: PurchaseReturn, amount: number) {
    if (!amount || amount <= 0) return;

    const type = await this.getOrCreateType(em, 'Thu tiền hoàn trả NCC', true);
    const supplierRef = (pr as any)?.supplier?.id ? { id: (pr as any).supplier.id } : (pr as any)?.supplierId ? { id: (pr as any).supplierId } : null;

    if (!supplierRef) {
      throw new ResponseException('PURCHASE_RETURN_MISSING_SUPPLIER', 400, 'Phiếu trả thiếu thông tin NCC');
    }

    const entry = em.getRepository(CashbookEntry).create({
      type: CashbookType.RECEIPT,
      code: this.genCode('PT'),
      date: (pr as any)?.createdAt ? new Date((pr as any).createdAt) : new Date(),
      cashType: type,
      amount: String(amount),
      counterpartyGroup: CounterpartyGroup.SUPPLIER,
      supplier: supplierRef as any,
      sourceCode: pr.code,
      purchaseReturn: { id: pr.id } as any, // 👈 Liên kết ID vào đây
    });

    await em.getRepository(CashbookEntry).save(entry);
    return entry;
  }

  /** Chi tiền mặt cho phiếu nhập – gọi TRONG transaction của PurchaseReceiptService */
  async postPaymentFromPurchase(em: EntityManager, pr: PurchaseReceipt, amount: number) {
    if (!amount || amount <= 0) return;
    const type = await this.getOrCreateType(em, 'Chi tiền trả NCC', false);
    const supplierRef =
      (pr as any)?.supplier?.id
        ? { id: (pr as any).supplier.id }
        : (pr as any)?.supplier_id
          ? { id: (pr as any).supplier_id }
          : null;

    if (!supplierRef) {
      throw new ResponseException('PURCHASE_RECEIPT_MISSING_SUPPLIER', 400, 'PURCHASE_RECEIPT_MISSING_SUPPLIER');
    }

    const entry = em.getRepository(CashbookEntry).create({
      type: CashbookType.PAYMENT,
      code: this.genCode('PC'),
      date: (pr as any)?.receiptDate ? new Date((pr as any).receiptDate) : new Date(),
      cashType: type,
      amount: String(amount),
      counterpartyGroup: CounterpartyGroup.SUPPLIER,
      supplier: supplierRef as any,
      purchaseReceipt: { id: (pr as any).id } as any,
      sourceCode: (pr as any)?.code ?? null,
    });

    await em.getRepository(CashbookEntry).save(entry);
    return entry;
  }

  /**
   * Chi tiền trả lại cho nhà cung cấp khi hủy/hoàn trả (sử dụng trong transaction của PurchaseReturnService)
   */
  async postPaymentFromPurchaseReturn(em: EntityManager, pr: PurchaseReturn, amount: number) {
    if (!amount || amount <= 0) return;
    const type = await this.getOrCreateType(em, 'Chi hoàn lại tiền trả hàng', false);
    const supplierRef = (pr as any)?.supplier?.id ? { id: (pr as any).supplier.id } : (pr as any)?.supplierId ? { id: (pr as any).supplierId } : null;

    const entry = em.getRepository(CashbookEntry).create({
      type: CashbookType.PAYMENT,
      code: this.genCode('PC'),
      date: (pr as any)?.cancelledAt ? new Date((pr as any).cancelledAt) : new Date(),
      cashType: type,
      amount: String(amount),
      counterpartyGroup: CounterpartyGroup.SUPPLIER,
      supplier: supplierRef as any,
      sourceCode: pr.code,
      purchaseReturn: { id: pr.id } as any,
    });

    await em.getRepository(CashbookEntry).save(entry);
    return entry;
  }

  // dùng cho cash book entry
  async getCashBookEntry(id: string) {
    const row = await this.repo.findOne({
      where: { id },
      relations: ['cashType', 'invoice', 'purchaseReceipt', 'purchaseReturn', 'customer', 'supplier', 'cashOtherParty', 'staff'] as any,
    });
    if (!row) throw new ResponseException('CASHBOOK_NOT_FOUND', 404, 'CASHBOOK_NOT_FOUND');
    return row;
  }

  // async createCashBookEntry(dto: CreateCashbookEntryDto) {
  //   if (dto.invoiceId && dto.purchaseReceiptId) {
  //     throw new ResponseException('ONLY_ONE_SOURCE_ALLOWED', 400, 'ONLY_ONE_SOURCE_ALLOWED');
  //   }

  //   //  Loại thu/chi
  //   const cashType = await this.typeRepo.findOne({ where: { id: dto.cashTypeId } });
  //   if (!cashType) throw new ResponseException('CASH_TYPE_NOT_FOUND', 400, 'CASH_TYPE_NOT_FOUND');

  //   const entry = this.repo.create({
  //     type: dto.type,
  //     code: this.genCode(dto.type === CashbookType.RECEIPT ? 'PT' : 'PC'),
  //     date: new Date(dto.date),
  //     cashType,
  //     amount: dto.amount,
  //     counterpartyGroup: dto.counterpartyGroup,
  //     sourceCode: dto.sourceCode ?? null,
  //   } as DeepPartial<CashbookEntry>);

  //   if (dto.invoiceId) {
  //     const inv = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId } });
  //     if (!inv) throw new ResponseException('INVOICE_NOT_FOUND', 400, 'INVOICE_NOT_FOUND');
  //     (entry as any).invoice = inv;
  //   }
  //   if (dto.purchaseReceiptId) {
  //     const pr = await this.prRepo.findOne({ where: { id: dto.purchaseReceiptId } });
  //     if (!pr) throw new ResponseException('PURCHASE_RECEIPT_NOT_FOUND', 400, 'PURCHASE_RECEIPT_NOT_FOUND');
  //     (entry as any).purchaseReceipt = pr;
  //   }

  //   if (dto.purchaseReturnId) {
  //     const prReturn = await this.returnRepo.findOne({ where: { id: dto.purchaseReturnId } });
  //     if (!prReturn) throw new ResponseException('PURCHASE_RETURN_NOT_FOUND', 404, 'Phiếu trả hàng không tồn tại');
  //     (entry as any).purchaseReturn = prReturn;
  //     entry.sourceCode = prReturn.code;
  //   }

  //   // 5) Gắn đối tượng theo nhóm
  //   if (dto.counterpartyGroup === CounterpartyGroup.CUSTOMER) {
  //     if (!dto.customerId) throw new ResponseException('MISSING_CUSTOMER_ID', 400, 'MISSING_CUSTOMER_ID');
  //     const c = await this.customerRepo.findOne({ where: { id: dto.customerId } });
  //     if (!c) throw new ResponseException('CUSTOMER_NOT_FOUND', 400, 'CUSTOMER_NOT_FOUND');
  //     (entry as any).customer = c;

  //   } else if (dto.counterpartyGroup === CounterpartyGroup.SUPPLIER) {
  //     if (!dto.supplierId) throw new ResponseException('MISSING_SUPPLIER_ID', 400, 'MISSING_SUPPLIER_ID');
  //     const s = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
  //     if (!s) throw new ResponseException('SUPPLIER_NOT_FOUND', 400, 'SUPPLIER_NOT_FOUND');
  //     (entry as any).supplier = s;

  //   }
  //   // ✅ thêm nhân viên
  //   else if (dto.counterpartyGroup === CounterpartyGroup.STAFF) {
  //     if (!dto.staffId) throw new ResponseException('MISSING_STAFF_ID', 400, 'MISSING_STAFF_ID');
  //     const staff = await this.userRepository.findOne({ where: { id: dto.staffId } });
  //     if (!staff) throw new ResponseException('STAFF_NOT_FOUND', 400, 'STAFF_NOT_FOUND');
  //     (entry as any).staff = staff;
  //   }
  //   // // ✅ thêm đối tác giao hàng
  //   // } else if (dto.counterpartyGroup === CounterpartyGroup.DELIVERY_PARTNER) {
  //   //   if (!dto.deliveryPartnerId) throw new ResponseException('MISSING_DELIVERY_PARTNER_ID', 400, 'MISSING_DELIVERY_PARTNER_ID');
  //   //   const dp = await this.deliveryPartnerRepo.findOne({ where: { id: dto.deliveryPartnerId } });
  //   //   if (!dp) throw new ResponseException('DELIVERY_PARTNER_NOT_FOUND', 400, 'DELIVERY_PARTNER_NOT_FOUND');
  //   //   (entry as any).deliveryPartner = dp;

  //   else if (dto.counterpartyGroup === CounterpartyGroup.OTHER) {
  //     let other = null;
  //     if (dto.cashOtherPartyId) {
  //       other = await this.otherPartyRepo.findOne({ where: { id: dto.cashOtherPartyId } });
  //       if (!other) throw new ResponseException('CASH_OTHER_PARTY_NOT_FOUND', 400, 'CASH_OTHER_PARTY_NOT_FOUND');
  //     } else if (dto.counterpartyName?.trim()) {
  //       // tạo nhanh other party từ tên
  //       other = await this.otherPartyRepo.save(this.otherPartyRepo.create({ name: dto.counterpartyName.trim() }));
  //     } else {
  //       throw new ResponseException('MISSING_COUNTERPARTY_INFO', 400, 'MISSING_COUNTERPARTY_INFO');
  //     }
  //     (entry as any).cashOtherParty = other;

  //   } else {
  //     throw new ResponseException('INVALID_COUNTERPARTY_GROUP', 400, 'INVALID_COUNTERPARTY_GROUP');
  //   }

  //   return this.repo.save(entry);
  // }

  async createCashBookEntry(dto: CreateCashbookEntryDto) {
    // 1. [SỬA] Validate chặt chẽ hơn: Đảm bảo chỉ có tối đa 1 nguồn chứng từ
    const sources = [dto.invoiceId, dto.purchaseReceiptId, dto.purchaseReturnId].filter(Boolean);
    if (sources.length > 1) {
      throw new ResponseException('ONLY_ONE_SOURCE_ALLOWED', 400, 'Chỉ được chọn một nguồn chứng từ (Hóa đơn, Nhập hoặc Trả hàng)');
    }

    // 2. Lấy CashType
    const cashType = await this.typeRepo.findOne({ where: { id: dto.cashTypeId } });
    if (!cashType) throw new ResponseException('CASH_TYPE_NOT_FOUND', 400, 'CASH_TYPE_NOT_FOUND');

    // 3. Khởi tạo Entry
    const entry = this.repo.create({
      type: dto.type,
      code: this.genCode(dto.type === CashbookType.RECEIPT ? 'PT' : 'PC'),
      date: new Date(dto.date),
      cashType,
      amount: dto.amount,
      counterpartyGroup: dto.counterpartyGroup,
      sourceCode: dto.sourceCode ?? null, // Sẽ được override nếu có chứng từ nguồn
    } as DeepPartial<CashbookEntry>);

    // 4. Gắn nguồn chứng từ
    if (dto.invoiceId) {
      const inv = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId } });
      if (!inv) throw new ResponseException('INVOICE_NOT_FOUND', 400, 'INVOICE_NOT_FOUND');
      (entry as any).invoice = inv;
      entry.sourceCode = inv.invoiceNumber; // Tự động điền sourceCode
    }

    if (dto.purchaseReceiptId) {
      const pr = await this.prRepo.findOne({ where: { id: dto.purchaseReceiptId } });
      if (!pr) throw new ResponseException('PURCHASE_RECEIPT_NOT_FOUND', 400, 'PURCHASE_RECEIPT_NOT_FOUND');
      (entry as any).purchaseReceipt = pr;
      entry.sourceCode = pr.code; // Tự động điền sourceCode
    }

    if (dto.purchaseReturnId) {
      const prReturn = await this.returnRepo.findOne({ where: { id: dto.purchaseReturnId } });
      if (!prReturn) throw new ResponseException('PURCHASE_RETURN_NOT_FOUND', 404, 'Phiếu trả hàng không tồn tại');
      (entry as any).purchaseReturn = prReturn;
      entry.sourceCode = prReturn.code; // Tự động điền sourceCode
    }

    // 5. Gắn đối tượng (Counterparty) - Giữ nguyên logic của bạn
    if (dto.counterpartyGroup === CounterpartyGroup.CUSTOMER) {
      if (!dto.customerId) throw new ResponseException('MISSING_CUSTOMER_ID', 400, 'MISSING_CUSTOMER_ID');
      const c = await this.customerRepo.findOne({ where: { id: dto.customerId } });
      if (!c) throw new ResponseException('CUSTOMER_NOT_FOUND', 400, 'CUSTOMER_NOT_FOUND');
      (entry as any).customer = c;

    } else if (dto.counterpartyGroup === CounterpartyGroup.SUPPLIER) {
      if (!dto.supplierId) throw new ResponseException('MISSING_SUPPLIER_ID', 400, 'MISSING_SUPPLIER_ID');
      const s = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
      if (!s) throw new ResponseException('SUPPLIER_NOT_FOUND', 400, 'SUPPLIER_NOT_FOUND');
      (entry as any).supplier = s;

    } else if (dto.counterpartyGroup === CounterpartyGroup.STAFF) {
      if (!dto.staffId) throw new ResponseException('MISSING_STAFF_ID', 400, 'MISSING_STAFF_ID');
      const staff = await this.userRepository.findOne({ where: { id: dto.staffId } });
      if (!staff) throw new ResponseException('STAFF_NOT_FOUND', 400, 'STAFF_NOT_FOUND');
      (entry as any).staff = staff;

    } else if (dto.counterpartyGroup === CounterpartyGroup.OTHER) {
      let other = null;
      if (dto.cashOtherPartyId) {
        other = await this.otherPartyRepo.findOne({ where: { id: dto.cashOtherPartyId } });
        if (!other) throw new ResponseException('CASH_OTHER_PARTY_NOT_FOUND', 400, 'CASH_OTHER_PARTY_NOT_FOUND');
      } else if (dto.counterpartyName?.trim()) {
        other = await this.otherPartyRepo.save(this.otherPartyRepo.create({ name: dto.counterpartyName.trim() }));
      } else {
        throw new ResponseException('MISSING_COUNTERPARTY_INFO', 400, 'MISSING_COUNTERPARTY_INFO');
      }
      (entry as any).cashOtherParty = other;

    } else {
      throw new ResponseException('INVALID_COUNTERPARTY_GROUP', 400, 'INVALID_COUNTERPARTY_GROUP');
    }

    // 6. Lưu vào DB
    const saved = await this.repo.save(entry);

    // 7. [QUAN TRỌNG] TRIGGER ĐỒNG BỘ CÔNG NỢ SAU KHI LƯU
    // Nếu không có đoạn này, tạo phiếu thu xong bên Trả hàng/Nhập hàng vẫn báo "Chưa thanh toán"

    // a. Đồng bộ cho Nhập hàng (PurchaseReceipt)
    if (saved.purchaseReceipt?.id) {
      await this.syncReceiptDebt(saved.purchaseReceipt.id);
    }

    // b. Đồng bộ cho Trả hàng (PurchaseReturn)
    if (saved.purchaseReturn?.id) {
      await this.syncReturnPaidAmount(saved.purchaseReturn.id);
    }

    return saved;
  }
  async listCashBookEntries(q: ListCashbookEntryDto) {
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(q.limit ?? 15)));

    const from = q.dateFrom ? this.sod(new Date(q.dateFrom)) : undefined;
    const to = q.dateTo ? this.eod(new Date(q.dateTo)) : undefined;

    const qb = this.repo.createQueryBuilder('e')
      .leftJoinAndSelect('e.cashType', 'cashType')
      .leftJoinAndSelect('e.invoice', 'invoice')
      .leftJoinAndSelect('e.purchaseReceipt', 'purchaseReceipt')
      .leftJoinAndSelect('e.purchaseReturn', 'purchaseReturn')
      .leftJoinAndSelect('e.customer', 'customer')
      .leftJoinAndSelect('e.supplier', 'supplier')
      .leftJoinAndSelect('e.staff', 'staff')
      .leftJoinAndSelect('e.cashOtherParty', 'other');

    if (q.q?.trim()) {
      const s = q.q.trim();
      qb.andWhere(new Brackets(b => {
        b.where('LOWER(e.code) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(e.sourceCode) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(customer.name) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(supplier.name) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(other.name) LIKE LOWER(:s)', { s: `%${s}%` });
      }));
    }
    if (q.type) qb.andWhere('e.type = :type', { type: q.type });
    if (q.counterpartyGroup) qb.andWhere('e.counterparty_group = :cg', { cg: q.counterpartyGroup });
    if (q.cashTypeId) qb.andWhere('e.cash_type_id = :ct', { ct: q.cashTypeId });
    if (from) qb.andWhere('e.date >= :from', { from });
    if (to) qb.andWhere('e.date <= :to', { to });

    const sortCol = q.sortBy ?? 'date';
    const dir = (q.sortDir ?? 'DESC') as ('ASC' | 'DESC');
    qb.orderBy(`e.${sortCol}`, dir)
      .addOrderBy('e.createdAt', 'DESC')
      .addOrderBy('e.code', 'DESC');

    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const meta: PageMeta = {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };

    return new ResponseCommon<typeof items, PageMeta>(200, true, 'OK', items, meta);
  }

  async findOneCashbook(id: string): Promise<ResponseCommon<CashbookEntry>> {
    try {
      const cashbook = await this.getCashBookEntry(id);
      return new ResponseCommon(200, true, 'GET_CASHBOOK_SUCCESS', cashbook);
    } catch (error) {
      throw new ResponseException(error, 500, 'GET_CASHBOOK_FAILED');
    }
  }

  async update(id: string, dto: { amount?: number; date?: Date; note?: string }) {
    const entry = await this.repo.findOne({
      where: { id },
      relations: ['purchaseReceipt', 'purchaseReturn'] // 👈 Load thêm relation Return
    });
    if (!entry) throw new ResponseException('CASHBOOK_NOT_FOUND', 404, 'CASHBOOK_NOT_FOUND');

    // Update amount logic (giữ nguyên logic âm/dương của bạn)
    if (dto.amount !== undefined) {
      const val = Math.abs(Number(dto.amount));
      if (entry.type === CashbookType.PAYMENT) {
        entry.amount = String(-val);
      } else {
        entry.amount = String(val);
      }
    }
    if (dto.date !== undefined) entry.date = new Date(dto.date);
    if (dto.note !== undefined) (entry as any).note = dto.note;

    const saved = await this.repo.save(entry);

    // 2. Trigger tính lại nợ
    if (saved.purchaseReceipt?.id) {
      await this.syncReceiptDebt(saved.purchaseReceipt.id);
    }

    // 👇 SYNC CHO TRẢ HÀNG
    if (saved.purchaseReturn?.id) {
      await this.syncReturnPaidAmount(saved.purchaseReturn.id);
    }

    return new ResponseCommon(200, true, 'UPDATE_CASHBOOK_SUCCESS', saved);
  }

  async summaryCashBookEntries(q: ListCashbookEntryDto) {
    const from = q.dateFrom ? this.sod(new Date(q.dateFrom)) : undefined;
    const to = q.dateTo ? this.eod(new Date(q.dateTo)) : undefined;

    // Opening balance (trước from). Nếu không có from -> 0
    let opening = 0;
    if (from) {
      const openQ = this.repo.createQueryBuilder('e')
        .leftJoin('e.customer', 'customer')
        .leftJoin('e.supplier', 'supplier')
        .leftJoin('e.cashOtherParty', 'other')
        .leftJoin('e.staff', 'staff')
        .select(`COALESCE(SUM(CASE WHEN e.type = 'RECEIPT' THEN e.amount ELSE -e.amount END), 0)`, 'balance')

        .where('e.date < :from', { from })


      // apply same filters as list
      if (q.q?.trim()) {
        const s = q.q.trim();
        openQ.andWhere(new Brackets(b => {
          b.where('LOWER(e.code) LIKE LOWER(:s)', { s: `%${s}%` })
            .orWhere('LOWER(e.sourceCode) LIKE LOWER(:s)', { s: `%${s}%` })
            .orWhere('LOWER(customer.name) LIKE LOWER(:s)', { s: `%${s}%` })
            .orWhere('LOWER(supplier.name) LIKE LOWER(:s)', { s: `%${s}%` })
            .orWhere('LOWER(other.name) LIKE LOWER(:s)', { s: `%${s}%` })
            .orWhere('LOWER(staff.profile.fullName) LIKE LOWER(:s)', {
              s: `%${s}%`,
            });
        }));
      }
      if (q.type) openQ.andWhere('e.type = :type', { type: q.type });
      if (q.counterpartyGroup) openQ.andWhere('e.counterpartyGroup = :cg', { cg: q.counterpartyGroup });
      if (q.cashTypeId) openQ.andWhere('e.cash_type_id = :ct', { ct: q.cashTypeId });
      const openRes = (await openQ.getRawOne<{ balance: string }>()) || { balance: '0' };
      opening = Number(openRes.balance || 0);
    }

    // Tổng thu/chi trong khoảng
    const sumQ = this.repo.createQueryBuilder('e')
      .leftJoin('e.customer', 'customer')
      .leftJoin('e.supplier', 'supplier')
      .leftJoin('e.cashOtherParty', 'other')
      .select(`COALESCE(SUM(CASE WHEN e.type = 'RECEIPT' THEN e.amount END), 0)`, 'receipt')
      .addSelect(`COALESCE(SUM(CASE WHEN e.type = 'PAYMENT' THEN e.amount END), 0)`, 'payment');

    // apply same filters as list
    if (from) sumQ.andWhere('e.date >= :from', { from });
    if (to) sumQ.andWhere('e.date <= :to', { to });
    if (q.q?.trim()) {
      const s = q.q.trim();
      sumQ.andWhere(new Brackets(b => {
        b.where('LOWER(e.code) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(e.sourceCode) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(customer.name) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(supplier.name) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(other.name) LIKE LOWER(:s)', { s: `%${s}%` });
      }));
    }
    if (q.type) sumQ.andWhere('e.type = :type', { type: q.type });
    if (q.counterpartyGroup) sumQ.andWhere('e.counterpartyGroup = :cg', { cg: q.counterpartyGroup });
    if (q.cashTypeId) sumQ.andWhere('e.cash_type_id = :ct', { ct: q.cashTypeId });

    const sumRes = (await sumQ.getRawOne<{ receipt: string; payment: string }>()) || { receipt: '0', payment: '0' };
    const totalReceipt = Number(sumRes.receipt || 0);
    const totalPayment = Number(sumRes.payment || 0);
    const closing = opening + totalReceipt - totalPayment;

    const summary = {
      openingBalance: opening,
      totalReceipt,
      totalPayment,
      closingBalance: closing,
    };
    return new ResponseCommon<typeof summary>(200, true, 'OK', summary);
  }


  // async remove(id: string) {
  //   const row = await this.repo.findOne({ where: { id } });
  //   if (!row) throw new NotFoundException('Cashbook entry not found');
  //   await this.repo.delete(id);
  //   return { success: true };
  // }



  // service dành cho cashbook other party


  /* ===== CREATE ===== */
  async createCashOtherParty(dto: CreateCashOtherPartyDto) {
    try {
      const entity = this.otherPartyRepo.create(dto as Partial<CashOtherParty>);
      const saved = await this.otherPartyRepo.save(entity);
      return new ResponseCommon(201, true, 'CREATE_CASH_OTHER_PARTY_SUCCESS', saved);
    } catch (error) {
      throw new ResponseException(error, 500, 'CREATE_CASH_OTHER_PARTY_FAILED');
    }
  }

  /* ===== LIST + SEARCH + PAGINATION ===== */
  async listCashOtherParty(params: ListCashOtherPartyDto) {
    try {
      const page = Math.max(1, Number(params.page ?? 1));
      const limit = Math.max(1, Math.min(100, Number(params.limit ?? 10)));

      const qb = this.otherPartyRepo.createQueryBuilder('p');

      const kw = params.q?.trim();
      if (kw) {
        qb.andWhere(
          `(p.name ILIKE :q OR p.phone ILIKE :q OR p.address ILIKE :q OR p.district ILIKE :q OR p.province ILIKE :q)`,
          { q: `%${kw}%` },
        );
      }

      qb.orderBy('p.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [items, total] = await qb.getManyAndCount();

      const meta: PageMeta = {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 0,
      };

      return new ResponseCommon<typeof items, PageMeta>(
        200,
        true,
        'Lấy danh sách đối tác khác thành công',
        items,
        meta,
      );
    } catch (error) {
      throw new ResponseException(error, 500, 'LIST_CASH_OTHER_PARTY_FAILED');
    }
  }

  /* ===== FIND ONE (helper private để reuse) ===== */
  private async getOtherPartyOrThrow(id: string): Promise<CashOtherParty> {
    const found = await this.otherPartyRepo.findOne({ where: { id } });
    if (!found) throw new ResponseException('CASH_OTHER_PARTY_NOT_FOUND', 404, 'CASH_OTHER_PARTY_NOT_FOUND');
    return found;
  }

  async findOneCashOtherParty(id: string) {
    try {
      const found = await this.getOtherPartyOrThrow(id);
      return new ResponseCommon(200, true, 'GET_CASH_OTHER_PARTY_SUCCESS', found);
    } catch (error) {
      throw new ResponseException(error, 500, 'GET_CASH_OTHER_PARTY_FAILED');
    }
  }

  /* ===== UPDATE ===== */
  async updateCashOtherParty(id: string, dto: UpdateCashOtherPartyDto) {
    try {
      const found = await this.getOtherPartyOrThrow(id);
      const merged = this.otherPartyRepo.merge(found, dto as Partial<CashOtherParty>);
      const saved = await this.otherPartyRepo.save(merged);
      return new ResponseCommon(200, true, 'UPDATE_CASH_OTHER_PARTY_SUCCESS', saved);
    } catch (error) {
      throw new ResponseException(error, 500, 'UPDATE_CASH_OTHER_PARTY_FAILED');
    }
  }

  /* ===== REMOVE (hard delete, nếu muốn soft-delete thì đổi ở đây) ===== */
  async removeCashOtherParty(id: string) {
    try {
      const found = await this.getOtherPartyOrThrow(id);
      await this.otherPartyRepo.remove(found);
      return new ResponseCommon(200, true, 'REMOVE_CASH_OTHER_PARTY_SUCCESS', true);
    } catch (error) {
      throw new ResponseException(error, 500, 'REMOVE_CASH_OTHER_PARTY_FAILED');
    }
  }

  // ===== CASH TYPE CRUD METHODS =====

  /* ===== CREATE CASH TYPE ===== */
  async createCashType(dto: CreateCashTypeDto) {
    try {
      // Kiểm tra trùng tên
      const exists = await this.typeRepo.findOne({ where: { name: dto.name } });
      if (exists) {
        throw new ResponseException('DUPLICATE_NAME', 400, 'DUPLICATE_NAME');
      }

      // Tạo entity trực tiếp
      const entity = new CashType();
      entity.name = dto.name;
      entity.isIncomeType = dto.isIncomeType ?? true;
      entity.isActive = dto.isActive ?? true;
      if (dto.description) {
        entity.description = dto.description;
      }
      const saved = await this.typeRepo.save(entity);
      return new ResponseCommon(201, true, 'CREATE_CASH_TYPE_SUCCESS', saved);
    } catch (error) {
      if (error instanceof ResponseException) {
        throw error;
      }
      throw new ResponseException(error, 500, 'CREATE_CASH_TYPE_FAILED');
    }
  }

  /* ===== GET LIST CASH TYPE ===== */
  async listCashTypes(params: ListCashTypeDto = {}) {
    try {
      const page = Math.max(1, Number(params.page ?? 1));
      const limit = Math.max(1, Math.min(100, Number(params.limit ?? 20)));

      const qb = this.typeRepo.createQueryBuilder('ct');

      // Search by name or description
      if (params.q?.trim()) {
        qb.andWhere('(ct.name ILIKE :q OR ct.description ILIKE :q)', {
          q: `%${params.q.trim()}%`
        });
      }

      // Filter by income type
      if (typeof params.isIncomeType === 'boolean') {
        qb.andWhere('ct.isIncomeType = :isIncome', { isIncome: params.isIncomeType });
      }

      // Filter by active status
      if (typeof params.isActive === 'boolean') {
        qb.andWhere('ct.isActive = :isActive', { isActive: params.isActive });
      }

      qb.orderBy('ct.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [items, total] = await qb.getManyAndCount();

      const meta: PageMeta = {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 0,
      };

      return new ResponseCommon(200, true, 'LIST_CASH_TYPE_SUCCESS', items, meta);
    } catch (error) {
      if (error instanceof ResponseException) {
        throw error;
      }
      throw new ResponseException(error, 500, 'LIST_CASH_TYPE_FAILED');
    }
  }

  /* ===== GET ONE CASH TYPE ===== */
  async findOneCashType(id: string) {
    try {
      const cashType = await this.typeRepo.findOne({ where: { id } });
      if (!cashType) {
        throw new ResponseException('CASH_TYPE_NOT_FOUND', 404, 'CASH_TYPE_NOT_FOUND');
      }
      return new ResponseCommon(200, true, 'GET_CASH_TYPE_SUCCESS', cashType);
    } catch (error) {
      if (error instanceof ResponseException) {
        throw error;
      }
      throw new ResponseException(error, 500, 'GET_CASH_TYPE_FAILED');
    }
  }

  /* ===== UPDATE CASH TYPE ===== */
  async updateCashType(id: string, dto: {
    name?: string;
    isIncomeType?: boolean;
    description?: string;
    isActive?: boolean
  }) {
    try {
      const cashType = await this.typeRepo.findOne({ where: { id } });
      if (!cashType) {
        throw new ResponseException('CASH_TYPE_NOT_FOUND', 404, 'CASH_TYPE_NOT_FOUND');
      }

      // Kiểm tra trùng tên nếu có thay đổi tên
      if (dto.name && dto.name !== cashType.name) {
        const exists = await this.typeRepo.findOne({
          where: { name: dto.name }
        });
        if (exists) {
          throw new ResponseException('DUPLICATE_NAME', 400, 'DUPLICATE_NAME');
        }
      }

      const merged = this.typeRepo.merge(cashType, dto);
      const saved = await this.typeRepo.save(merged);
      return new ResponseCommon(200, true, 'UPDATE_CASH_TYPE_SUCCESS', saved);
    } catch (error) {
      if (error instanceof ResponseException) {
        throw error;
      }
      throw new ResponseException(error, 500, 'UPDATE_CASH_TYPE_FAILED');
    }
  }

  /* ===== SOFT DELETE CASH TYPE ===== */
  async removeCashType(id: string) {
    try {
      const cashType = await this.typeRepo.findOne({ where: { id } });
      if (!cashType) {
        throw new ResponseException('CASH_TYPE_NOT_FOUND', 404, 'CASH_TYPE_NOT_FOUND');
      }

      // Nếu đã inactive thì không làm gì hết
      if (!cashType.isActive) {
        return new ResponseCommon(200, true, 'CASH_TYPE_ALREADY_INACTIVE', cashType);
      }

      // Kiểm tra xem có cash book entry nào đang dùng loại này không
      const usageCount = await this.repo.count({ where: { cashType: { id } } });
      cashType.isActive = false;
      const saved = await this.typeRepo.save(cashType);
      // Nếu có dùng thì báo đã disable nhưng không xóa được
      const message = usageCount > 0 ? 'CASH_TYPE_DISABLED_IN_USE' : 'CASH_TYPE_DISABLED';
      return new ResponseCommon(200, true, message, saved);
    } catch (error) {
      if (error instanceof ResponseException) {
        throw error;
      }
      throw new ResponseException(error, 500, 'DELETE_CASH_TYPE_FAILED');
    }
  }

  async createPaymentVoucherWithTransaction(manager: EntityManager, data: {
    refId: string;
    refType: 'PURCHASE_RECEIPT'; // Có thể mở rộng type sau này
    amount: number;
    note?: string;
    // Thêm các field cần thiết khác nếu có (paymentMethod...)
  }) {
    // Tìm CashType mặc định cho chi trả NCC
    // Lưu ý: Nên có constant hoặc config cho tên loại thu chi này để tránh hardcode string
    const type = await this.getOrCreateType(manager, 'Chi tiền trả NCC', false);

    // Tìm Supplier từ PurchaseReceipt để gắn vào CashbookEntry
    const pr = await manager.getRepository(PurchaseReceipt).findOne({
      where: { id: data.refId },
      relations: ['supplier']
    });

    if (!pr || !pr.supplier) {
      throw new ResponseException('SUPPLIER_NOT_FOUND_IN_RECEIPT', 404);
    }

    const entry = manager.create(CashbookEntry, {
      type: CashbookType.PAYMENT,
      code: this.genCode('PC'),
      date: new Date(),
      cashType: type,
      // Chi tiền thì lưu số tiền là dương (amount trong DB là numeric), 
      // nhưng khi tính toán balance thì payment sẽ bị trừ.
      // Tùy logic `summaryCashBookEntries` của bạn đang cộng hay trừ.
      // Ở hàm summary bạn viết: CASE WHEN PAYMENT THEN e.amount (đang coi là số dương).
      // Vậy ở đây lưu số dương là đúng.
      amount: String(data.amount),

      counterpartyGroup: CounterpartyGroup.SUPPLIER,
      supplier: pr.supplier,
      purchaseReceipt: pr,      // Link tới phiếu nhập
      sourceCode: pr.code,      // Lưu mã phiếu nhập để dễ tra cứu
      note: data.note,
    });

    await manager.save(CashbookEntry, entry);
    return entry;
  }

  async syncReceiptDebt(receiptId: string) {
    await this.repo.manager.transaction(async (em) => {
      const receipt = await em.getRepository(PurchaseReceipt).findOne({
        where: { id: receiptId },
        relations: ['items']
      });
      if (!receipt) return;

      // 1. Tính tổng đơn hàng
      // (Đảm bảo hàm calcReceiptTotals đã được import đúng)
      const totals = calcReceiptTotals(receipt.items, receipt);
      const grandTotal = +Number(totals.total).toFixed(2);

      // 2. Tính tổng tiền ĐÃ CHI từ Sổ Quỹ
      const { totalPaid } = await em.getRepository(CashbookEntry)
        .createQueryBuilder('cb')
        .select('SUM(cb.amount)', 'totalPaid') // Kết quả sẽ là số âm (vd: -4000)
        .where('cb.purchase_receipt_id = :rid', { rid: receiptId }) // Chú ý tên cột quan hệ (purchaseReceiptId hay purchase_receipt_id tùy entity)
        .andWhere('cb.type = :type', { type: CashbookType.PAYMENT })
        .getRawOne();

      // [SỬA Ở ĐÂY] Lấy trị tuyệt đối để đảm bảo amountPaid luôn DƯƠNG
      const paidAmount = Math.abs(Number(totalPaid || 0));

      // 3. Update lại Phiếu Nhập
      receipt.amountPaid = paidAmount;

      // Tính nợ: Tổng - Đã trả (đảm bảo không âm do làm tròn)
      receipt.debt = Math.max(0, +(grandTotal - paidAmount).toFixed(2));

      if (receipt.debt === 0) {
        receipt.status = ReceiptStatus.PAID;
      } else {
        receipt.status = ReceiptStatus.OWING;
      }

      await em.save(PurchaseReceipt, receipt);
    });
  }

  async remove(id: string) {
    const row = await this.repo.findOne({ where: { id }, relations: ['purchaseReceipt'] });
    if (!row) throw new ResponseException('CASHBOOK_NOT_FOUND', 404, 'CASHBOOK_NOT_FOUND');

    const prId = row.purchaseReceipt?.id; // Lưu lại ID phiếu nhập

    await this.repo.remove(row);

    // [TRIGGER] Tính lại công nợ cho phiếu nhập liên quan
    if (prId) {
      await this.syncReceiptDebt(prId);
    }

    return { success: true };
  }

  async syncReturnPaidAmount(returnId: string) {
    // Dùng transaction manager của repo hiện tại để đảm bảo data mới nhất
    await this.repo.manager.transaction(async (em) => {
      const pr = await em.getRepository(PurchaseReturn).findOne({ where: { id: returnId } });
      if (!pr) return;

      // Tính tổng Thu (NCC trả tiền cho mình)
      const { totalReceipt } = await em.getRepository(CashbookEntry)
        .createQueryBuilder('cb')
        .select('SUM(cb.amount)', 'totalReceipt')
        .where('cb.purchase_return_id = :rid', { rid: returnId })
        .andWhere('cb.type = :type', { type: CashbookType.RECEIPT })
        .getRawOne();

      // Tính tổng Chi (Mình trả lại NCC - nếu có hủy phiếu thu)
      const { totalPayment } = await em.getRepository(CashbookEntry)
        .createQueryBuilder('cb')
        .select('SUM(cb.amount)', 'totalPayment')
        .where('cb.purchase_return_id = :rid', { rid: returnId })
        .andWhere('cb.type = :type', { type: CashbookType.PAYMENT })
        .getRawOne();

      const r = Number(totalReceipt || 0);
      const p = Number(totalPayment || 0);

      // Thực nhận = Thu - Chi
      const netPaid = Math.max(0, r - p);

      // Cập nhật nếu số tiền thay đổi
      if (Number(pr.paidAmount) !== Number(netPaid.toFixed(2))) {
        pr.paidAmount = +netPaid.toFixed(2);
        await em.getRepository(PurchaseReturn).save(pr);
      }
    });
  }
  private sod(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  private eod(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
}