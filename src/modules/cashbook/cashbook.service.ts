import { Injectable } from '@nestjs/common';
import { CashbookEntry } from './entities/cashbook.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DeepPartial, EntityManager, ILike, Repository } from 'typeorm';
import { CashType } from './entities/cash_types.entity';
import { Invoice } from '@modules/invoice/entities/invoice.entity';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { CreateCashbookEntryDto } from './dto/create-cashbook.dto';
import { CashbookType, CounterpartyGroup } from 'src/common/enums';
import { Customer } from '@modules/customers/entities/customers.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { CashOtherParty } from './entities/cash_other_party';
import { PageMeta } from 'src/common/common_dto/paginated';
import { CreateCashOtherPartyDto } from './dto/create-cash-other-party.dto';
import { ListCashOtherPartyDto } from './dto/list-cash-other-party.dto';
import { UpdateCashOtherPartyDto } from './dto/update-cash-other-party.dto';
import { CashbookSummaryDto } from './dto/summary.dto';
import { ListCashbookEntryDto } from './dto/list-cashbook.dto';

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
    @InjectRepository(CashOtherParty)
    private readonly cashOtherParty: Repository<CashOtherParty>,
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
      isPostedToBusinessResult: true,
      counterpartyGroup: CounterpartyGroup.CUSTOMER,
      customer: customerRef as any,
      invoice: { id: (inv as any).id } as any,
      sourceCode: (inv as any)?.invoiceNumber ?? null,
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
      throw new ResponseException(false, 400, 'PurchaseReceipt thiếu supplier → không thể lập phiếu chi nhóm SUPPLIER.');
    }

    const entry = em.getRepository(CashbookEntry).create({
      type: CashbookType.PAYMENT,
      code: this.genCode('PC'),
      date: (pr as any)?.receiptDate ? new Date((pr as any).receiptDate) : new Date(),
      cashType: type,
      amount: String(amount),
      isPostedToBusinessResult: true,
      counterpartyGroup: CounterpartyGroup.SUPPLIER,
      supplier: supplierRef as any,
      purchaseReceipt: { id: (pr as any).id } as any,
      sourceCode: (pr as any)?.code ?? null,
    });

    await em.getRepository(CashbookEntry).save(entry);
    return entry;
  }

  // dùng cho cash book entry
  async getCashBookEntry(id: string) {
    const row = await this.repo.findOne({ where: { id }, relations: ['cashType', 'invoice', 'purchaseReceipt'] as any });
    if (!row) throw new ResponseException(false, 404, 'Không tìm thấy phiếu thu/chi');
    return row;
  }

  async createCashBookEntry(dto: CreateCashbookEntryDto) {
    if (dto.invoiceId && dto.purchaseReceiptId) {
      throw new ResponseException(false, 400, 'Chỉ được liên kết 1 nguồn (invoiceId hoặc purchaseReceiptId)');
    }

    //  Loại thu/chi
    const cashType = await this.typeRepo.findOne({ where: { id: dto.cashTypeId } });
    if (!cashType) throw new ResponseException(false, 400, 'cashTypeId không tồn tại');

    const entry = this.repo.create({
      type: dto.type,
      code: this.genCode(dto.type === CashbookType.RECEIPT ? 'PT' : 'PC'),
      date: new Date(dto.date),
      cashType,
      amount: dto.amount,
      isPostedToBusinessResult: dto.isPostedToBusinessResult ?? true,
      counterpartyGroup: dto.counterpartyGroup,
      sourceCode: dto.sourceCode ?? null,
    } as DeepPartial<CashbookEntry>);

    if (dto.invoiceId) {
      const inv = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId } });
      if (!inv) throw new ResponseException(false, 400, 'invoiceId không tồn tại');
      (entry as any).invoice = inv;
    }
    if (dto.purchaseReceiptId) {
      const pr = await this.prRepo.findOne({ where: { id: dto.purchaseReceiptId } });
      if (!pr) throw new ResponseException(false, 400, 'purchaseReceiptId không tồn tại');
      (entry as any).purchaseReceipt = pr;
    }

    // 5) Gắn đối tượng theo nhóm
    if (dto.counterpartyGroup === CounterpartyGroup.CUSTOMER) {
      if (!dto.customerId) throw new ResponseException(false, 400, 'Thiếu customerId cho nhóm CUSTOMER');
      const c = await this.customerRepo.findOne({ where: { id: dto.customerId } });
      if (!c) throw new ResponseException(false, 400, 'customerId không tồn tại');
      (entry as any).customer = c;

    } else if (dto.counterpartyGroup === CounterpartyGroup.SUPPLIER) {
      if (!dto.supplierId) throw new ResponseException(false, 400, 'Thiếu supplierId cho nhóm SUPPLIER');
      const s = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
      if (!s) throw new ResponseException(false, 400, 'supplierId không tồn tại');
      (entry as any).supplier = s;

    } else if (dto.counterpartyGroup === CounterpartyGroup.OTHER) {
      let other = null;
      if (dto.cashOtherPartyId) {
        other = await this.otherPartyRepo.findOne({ where: { id: dto.cashOtherPartyId } });
        if (!other) throw new ResponseException(false, 400, 'cashOtherPartyId không tồn tại');
      } else if (dto.counterpartyName?.trim()) {
        // tạo nhanh other party từ tên
        other = await this.otherPartyRepo.save(this.otherPartyRepo.create({ name: dto.counterpartyName.trim() }));
      } else {
        throw new ResponseException(false, 400, 'Thiếu cashOtherPartyId hoặc counterpartyName cho nhóm OTHER');
      }
      (entry as any).cashOtherParty = other;

    } else {
      throw new ResponseException(false, 400, 'counterpartyGroup không hợp lệ');
    }

    return this.repo.save(entry);
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
      .leftJoinAndSelect('e.customer', 'customer')
      .leftJoinAndSelect('e.supplier', 'supplier')
      .leftJoinAndSelect('e.cashOtherParty', 'other');

    if (q.q?.trim()) {
      const s = q.q.trim();
      qb.andWhere(new Brackets(b => {
        b.where('LOWER(e.code) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(e.sourceCode) LIKE LOWER(:s)', { s: `%${s}%` })
          .orWhere('LOWER(e.counterpartyName) LIKE LOWER(:s)', { s: `%${s}%` });
      }));
    }
    if (q.type) qb.andWhere('e.type = :type', { type: q.type });
    if (q.counterpartyGroup) qb.andWhere('e.counterpartyGroup = :cg', { cg: q.counterpartyGroup });
    if (q.cashTypeId) qb.andWhere('e.cashTypeId = :ct', { ct: q.cashTypeId });
    if (typeof q.isPostedToBusinessResult === 'boolean') {
      qb.andWhere('e.isPostedToBusinessResult = :pbr', { pbr: q.isPostedToBusinessResult });
    }
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
      const cashbook = await this.repo.findOne({ where: { id } });
      if (!cashbook) {
        throw new ResponseException('NOT_FOUND', 404, 'Cashbook không tồn tại');
      }
      return new ResponseCommon(200, true, 'Lấy thông tin Cashbook thành công', cashbook);
    } catch (error) {
      throw new ResponseException(error, 500, 'Lỗi khi lấy thông tin Cashbook');
    }
  }
  // async summaryCashBookEntries(q: ListCashbookEntryDto) {
  //   const from = q.dateFrom ? this.sod(new Date(q.dateFrom)) : undefined;
  //   const to = q.dateTo ? this.eod(new Date(q.dateTo)) : undefined;

  //   // Opening balance (trước from). Nếu không có from -> 0
  //   let opening = 0;
  //   if (from) {
  //     const openQ = this.repo.createQueryBuilder('e')
  //       .select(`COALESCE(SUM(CASE WHEN e.type = 'RECEIPT' THEN e.amount ELSE -e.amount END), 0)`, 'balance')
  //       .where('e.date < :from', { from });

  //     if (q.counterpartyGroup) openQ.andWhere('e.counterpartyGroup = :cg', { cg: q.counterpartyGroup });
  //     if (q.cashTypeId) openQ.andWhere('e.cashTypeId = :ct', { ct: q.cashTypeId });
  //     if (typeof q.isPostedToBusinessResult === 'boolean') {
  //       openQ.andWhere('e.isPostedToBusinessResult = :pbr', { pbr: q.isPostedToBusinessResult });
  //     }
  //     const { balance } = await openQ.getRawOne<{ balance: string }>();
  //     opening = Number(balance || 0);
  //   }

  //   // Tổng thu/chi trong khoảng
  //   const sumQ = this.repo.createQueryBuilder('e')
  //     .select(`COALESCE(SUM(CASE WHEN e.type = 'RECEIPT' THEN e.amount END), 0)`, 'receipt')
  //     .addSelect(`COALESCE(SUM(CASE WHEN e.type = 'PAYMENT' THEN e.amount END), 0)`, 'payment');

  //   if (from) sumQ.andWhere('e.date >= :from', { from });
  //   if (to) sumQ.andWhere('e.date <= :to', { to });
  //   if (q.counterpartyGroup) sumQ.andWhere('e.counterpartyGroup = :cg', { cg: q.counterpartyGroup });
  //   if (q.cashTypeId) sumQ.andWhere('e.cashTypeId = :ct', { ct: q.cashTypeId });
  //   if (typeof q.isPostedToBusinessResult === 'boolean') {
  //     sumQ.andWhere('e.isPostedToBusinessResult = :pbr', { pbr: q.isPostedToBusinessResult });
  //   }

  //   const { receipt, payment } = await sumQ.getRawOne<{ receipt: string; payment: string }>();
  //   const totalReceipt = Number(receipt || 0);
  //   const totalPayment = Number(payment || 0);
  //   const closing = opening + totalReceipt - totalPayment;

  //   const summary = {
  //     openingBalance: opening,
  //     totalReceipt,
  //     totalPayment,
  //     closingBalance: closing,
  //   };

  //   // 👉 Trả đúng mẫu: data = summary, không cần meta
  //   return new ResponseCommon<typeof summary>(200, true, 'OK', summary);
  // }


  // async remove(id: string) {
  //   const row = await this.repo.findOne({ where: { id } });
  //   if (!row) throw new NotFoundException('Cashbook entry not found');
  //   await this.repo.delete(id);
  //   return { success: true };
  // }

  // async summary(q: CashbookSummaryDto) {
  //   const from = q.dateFrom ? new Date(q.dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  //   const to = q.dateTo ? new Date(q.dateTo) : new Date();

  //   // tổng thu/chi trong kỳ
  //   const { totalReceipt } = await this.repo.createQueryBuilder('e')
  //     .select(`COALESCE(SUM(CASE WHEN e.type = :r THEN e.amount::numeric ELSE 0 END), 0)`, 'totalReceipt')
  //     .where('e.date BETWEEN :from AND :to', { from, to })
  //     .setParameters({ r: CashbookType.RECEIPT })
  //     .getRawOne<{ totalReceipt: string }>();

  //   const { totalPayment } = await this.repo.createQueryBuilder('e')
  //     .select(`COALESCE(SUM(CASE WHEN e.type = :p THEN e.amount::numeric ELSE 0 END), 0)`, 'totalPayment')
  //     .where('e.date BETWEEN :from AND :to', { from, to })
  //     .setParameters({ p: CashbookType.PAYMENT })
  //     .getRawOne<{ totalPayment: string }>();

  //   // số dư đầu kỳ
  //   const { opening } = await this.repo.createQueryBuilder('e')
  //     .select(`
  //       COALESCE(SUM(CASE WHEN e.type = :r THEN e.amount::numeric ELSE -e.amount::numeric END), 0)
  //     `, 'opening')
  //     .where('e.date < :from', { from })
  //     .setParameters({ r: CashbookType.RECEIPT })
  //     .getRawOne<{ opening: string }>();

  //   const openingNum = Number(opening ?? 0);
  //   const inNum = Number(totalReceipt ?? 0);
  //   const outNum = Number(totalPayment ?? 0);
  //   const balance = openingNum + inNum - outNum;

  //   return {
  //     dateFrom: from.toISOString(),
  //     dateTo: to.toISOString(),
  //     opening: openingNum,
  //     totalReceipt: inNum,
  //     totalPayment: outNum,
  //     balance,
  //   };
  // }



  // service dành cho cashbook other party


  /* ===== CREATE ===== */
  async createCashOtherParty(dto: CreateCashOtherPartyDto) {
    try {
      const entity = this.otherPartyRepo.create(dto as Partial<CashOtherParty>);
      const saved = await this.otherPartyRepo.save(entity);
      return new ResponseCommon(201, true, 'Tạo đối tác khác thành công', saved);
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
    if (!found) throw new ResponseException('NOT_FOUND', 404, 'Other party không tồn tại');
    return found;
  }

  async findOneCashOtherParty(id: string) {
    try {
      const found = await this.getOtherPartyOrThrow(id);
      return new ResponseCommon(200, true, 'Lấy đối tác khác thành công', found);
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
      return new ResponseCommon(200, true, 'Cập nhật đối tác khác thành công', saved);
    } catch (error) {
      throw new ResponseException(error, 500, 'UPDATE_CASH_OTHER_PARTY_FAILED');
    }
  }

  /* ===== REMOVE (hard delete, nếu muốn soft-delete thì đổi ở đây) ===== */
  async removeCashOtherParty(id: string) {
    try {
      const found = await this.getOtherPartyOrThrow(id);
      await this.otherPartyRepo.remove(found);
      return new ResponseCommon(200, true, 'Xóa đối tác khác thành công', true);
    } catch (error) {
      throw new ResponseException(error, 500, 'REMOVE_CASH_OTHER_PARTY_FAILED');
    }
  }

  private sod(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  private eod(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
}