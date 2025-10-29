import { Injectable } from '@nestjs/common';
import { InventoryAction, PurchaseReturnStatus, DiscountType } from 'src/common/enums';
import { InjectRepository } from '@nestjs/typeorm';
import { PurchaseReturn } from './entities/purchasereturn.entity';
import { DataSource, In, Repository } from 'typeorm';
import { PurchaseReturnLog } from './entities/purchasereturnlog.entity';
import { resolveUomAndFactor } from '@modules/helper/purchasereceipthelper.service';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { InventoryTransaction } from '@modules/inventorytransaction/entities/inventorytransaction.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { User } from '@modules/user/entities/user.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { ResponseException, ResponseCommon } from 'src/common/common_dto/respone.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { StandaloneReturnDto } from './dto/standalone-return.dto';
import { UpdateStandaloneReturnDto } from './dto/update-standalone-return.dto';

@Injectable()
export class PurchasereturnService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(PurchaseReturn) private readonly prRepo: Repository<PurchaseReturn>
  ) { }

  private roundMoney(n: number) { return +(+n).toFixed(2); }
  private roundQty(n: number) { return +(+n).toFixed(3); }

  private computeDiscountFromType(totalGoods: number, discountType?: DiscountType, discountValue?: number) {
    // default to amount 0 when not provided
    const dt = discountType ?? DiscountType.AMOUNT;
    const dv = Number(discountValue ?? 0);
    if (dt === DiscountType.AMOUNT) return this.roundMoney(dv);
    // percent
    return this.roundMoney((dv / 100) * totalGoods);
  }

  private allocateDiscount(lineTotals: number[], discount: number): number[] {
    const total = lineTotals.reduce((a, b) => a + b, 0);
    if (total <= 0 || !discount) return lineTotals.map(() => 0);
    const alloc = lineTotals.map(t => this.roundMoney((t / total) * discount));
    const diff = this.roundMoney(discount - alloc.reduce((a, b) => a + b, 0));
    if (diff !== 0 && alloc.length) alloc[alloc.length - 1] = this.roundMoney(alloc[alloc.length - 1] + diff);
    return alloc;
  }

  async createStandalone(userId: string, dto: StandaloneReturnDto) {
    if (!dto.items?.length) throw new ResponseException(null, 400, 'RETURN_ITEM_LIST_EMPTY');

    return this.ds.transaction(async (em) => {
      const user = userId ? await em.getRepository(User).findOne({ where: { id: userId } }) : null;
      const supplier = await em.getRepository(Supplier).findOne({ where: { id: dto.supplierId } });
      if (!supplier) throw new ResponseException(null, 404, 'SUPPLIER_NOT_FOUND');

      const invIds = dto.items.map(i => i.itemId);
      const invs = await em.getRepository(InventoryItem).find({ where: { id: In(invIds) }, relations: ['baseUom'] });
      if (invs.length !== invIds.length) throw new ResponseException(null, 404, 'ONE_OR_MORE_ITEMS_NOT_FOUND');
      const invMap = new Map(invs.map(x => [x.id, x]));

      const header = em.getRepository(PurchaseReturn).create({
        code: await this.genCode(em),
        supplier,
        totalGoods: 0,
        discount: 0,
        totalAfterDiscount: 0,
        refundAmount: 0,
        status: PurchaseReturnStatus.POSTED,
        createdBy: user ?? undefined,
        note: dto.reason ?? undefined,
      });
      const savedHeader = await em.getRepository(PurchaseReturn).save(header);

      let totalGoods = 0;
      const createdLogs: PurchaseReturnLog[] = [];

      for (const line of dto.items) {
        const inv = invMap.get(line.itemId)!;

        // resolve received UOM and conversion factor (allow returns in non-base units)
        let receivedUomCode = (line as any).receivedUomCode ?? null;
        let factor = 1;
        try {
          // conversionToBase removed from DTO: always resolve factor from DB/uom conversions
          const res = await resolveUomAndFactor(
            em,
            (inv as any).baseUom?.code,
            receivedUomCode,
            null,
          );
          receivedUomCode = res.received.code;
          factor = res.factor;
        } catch (err: any) {
          const msg = String(err?.message || err);
          if (msg === 'BASE_UOM_NOT_FOUND') throw new ResponseException(null, 400, `BASE_UOM_NOT_FOUND_FOR_ITEM:${inv.id}`);
          if (msg === 'RECEIVED_UOM_NOT_FOUND') throw new ResponseException(null, 400, `RECEIVED_UOM_NOT_FOUND_FOR_ITEM:${inv.id}`);
          if (msg === 'UOM_DIMENSION_MISMATCH') throw new ResponseException(null, 400, `UOM_DIMENSION_MISMATCH_FOR_ITEM:${inv.id}`);
          if (msg === 'NO_CONVERSION_DEFINED') throw new ResponseException(null, 400, `NO_CONVERSION_DEFINED_FOR_ITEM:${inv.id}`);
          throw new ResponseException(null, 400, `UOM_ERROR_FOR_ITEM:${inv.id}`);
        }

        const qty = Number(line.quantity ?? 0);
        if (!(qty > 0)) throw new ResponseException(null, 400, 'INVALID_RETURN_QTY');

        const baseQty = this.roundQty(qty * factor);

        const before = Number(inv.quantity);
        if (before + 1e-6 < baseQty) throw new ResponseException(null, 400, `INSUFFICIENT_STOCK_FOR_RETURN:${inv.id}`);
        const after = this.roundQty(before - baseQty);
        inv.quantity = after as any;
        await em.getRepository(InventoryItem).save(inv);

        const tx = em.getRepository(InventoryTransaction).create({
          item: { id: inv.id } as any,
          quantity: baseQty,
          action: InventoryAction.OUT,
          beforeQty: before,
          afterQty: after,
          refType: 'PURCHASE_RETURN',
          refId: savedHeader.id,
          refItemId: null,
          note: dto.reason ?? undefined,
          performedBy: user ? ({ id: user.id } as any) : null,
        } as any);
        const savedTx = await em.getRepository(InventoryTransaction).save(tx as any);

        const unitPrice = this.roundMoney(Number(line.unitPrice ?? 0));
        // unitPrice is per received unit; line total before discount uses received-qty
        const lineTotalBeforeDiscount = this.roundMoney(unitPrice * qty);
        totalGoods = this.roundMoney(totalGoods + lineTotalBeforeDiscount);

        const log = em.getRepository(PurchaseReturnLog).create({
          purchaseReturn: savedHeader,
          receipt: null,
          receiptItem: null,
          item: inv,
          quantity: qty,
          conversionToBase: factor,
          baseQty,
          reason: dto.reason ?? undefined,
          unitPrice,
          lineTotalBeforeDiscount,
          globalDiscountAllocated: 0,
          lineTotalAfterDiscount: 0,
          refundAmount: 0,
          inventoryTx: savedTx,
          performedBy: user ?? undefined,
        } as any) as unknown as PurchaseReturnLog;
        createdLogs.push(log);
      }

      // header discount is applied on total goods (no per-line discounts)
      const discountAmount = this.computeDiscountFromType(totalGoods, (dto as any).discountType, (dto as any).discountValue);
      const allocs = this.allocateDiscount(createdLogs.map(l => this.roundMoney(l.lineTotalBeforeDiscount)), discountAmount);
      createdLogs.forEach((l, i) => {
        l.globalDiscountAllocated = allocs[i];
        const afterLine = this.roundMoney(l.lineTotalBeforeDiscount);
        l.lineTotalAfterDiscount = this.roundMoney(afterLine - l.globalDiscountAllocated);
        l.refundAmount = l.lineTotalAfterDiscount;
      });
      await em.getRepository(PurchaseReturnLog).save(createdLogs);
      const totalAfterDiscount = this.roundMoney(totalGoods - discountAmount);
      const paidInput = this.roundMoney(Number((dto as any).paidAmount ?? 0));
      if (paidInput < 0) throw new ResponseException(null, 400, 'INVALID_PAID_AMOUNT');
      if (paidInput > this.roundMoney(totalAfterDiscount)) throw new ResponseException(null, 400, 'PAID_AMOUNT_EXCEEDS_REFUND');

      savedHeader.totalGoods = totalGoods;
      savedHeader.discount = discountAmount;
      savedHeader.totalAfterDiscount = totalAfterDiscount;
      savedHeader.refundAmount = totalAfterDiscount;
      savedHeader.paidAmount = paidInput;
      (savedHeader as any).postedAt = new Date();
      await em.getRepository(PurchaseReturn).save(savedHeader);

      return {
        id: savedHeader.id,
        code: savedHeader.code,
        supplierId: savedHeader.supplier.id,
        totalGoods,
        discount: savedHeader.discount,
        totalAfterDiscount,
        refundAmount: savedHeader.refundAmount,
        paidAmount: savedHeader.paidAmount,
      };
    });
  }

  async createDraft(userId: string, dto: StandaloneReturnDto) {
    if (!dto.items?.length) throw new ResponseException(null, 400, 'RETURN_ITEM_LIST_EMPTY');

    return this.ds.transaction(async (em) => {
      const user = userId ? await em.getRepository(User).findOne({ where: { id: userId } }) : null;
      const supplier = await em.getRepository(Supplier).findOne({ where: { id: dto.supplierId } });
      if (!supplier) throw new ResponseException(null, 404, 'SUPPLIER_NOT_FOUND');

      const invIds = dto.items.map(i => i.itemId);
      const invs = await em.getRepository(InventoryItem).find({ where: { id: In(invIds) }, relations: ['baseUom'] });
      if (invs.length !== invIds.length) throw new ResponseException(null, 404, 'ONE_OR_MORE_ITEMS_NOT_FOUND');
      const invMap = new Map(invs.map(x => [x.id, x]));

      const header = em.getRepository(PurchaseReturn).create({
        code: await this.genCode(em),
        supplier,
        totalGoods: 0,
        discount: 0,
        totalAfterDiscount: 0,
        refundAmount: 0,
        status: PurchaseReturnStatus.DRAFT,
        createdBy: user ?? undefined,
        note: dto.reason ?? undefined,
      });
      const savedHeader = await em.getRepository(PurchaseReturn).save(header);

      let totalGoods = 0;
      const createdLogs: PurchaseReturnLog[] = [];

      for (const line of dto.items) {
        const inv = invMap.get(line.itemId as string)!;

        let receivedUomCode = (line as any).receivedUomCode ?? null;
        let factor = 1;
        try {
          // conversionToBase removed from DTO
          const res = await resolveUomAndFactor(
            em,
            (inv as any).baseUom?.code,
            receivedUomCode,
            null,
          );
          receivedUomCode = res.received.code;
          factor = res.factor;
        } catch (err: any) {
          const msg = String(err?.message || err);
          if (msg === 'BASE_UOM_NOT_FOUND') throw new ResponseException(null, 400, `BASE_UOM_NOT_FOUND_FOR_ITEM:${inv.id}`);
          if (msg === 'RECEIVED_UOM_NOT_FOUND') throw new ResponseException(null, 400, `RECEIVED_UOM_NOT_FOUND_FOR_ITEM:${inv.id}`);
          if (msg === 'UOM_DIMENSION_MISMATCH') throw new ResponseException(null, 400, `UOM_DIMENSION_MISMATCH_FOR_ITEM:${inv.id}`);
          if (msg === 'NO_CONVERSION_DEFINED') throw new ResponseException(null, 400, `NO_CONVERSION_DEFINED_FOR_ITEM:${inv.id}`);
          throw new ResponseException(null, 400, `UOM_ERROR_FOR_ITEM:${inv.id}`);
        }

        const qty = Number(line.quantity ?? 0);
        if (!(qty > 0)) throw new ResponseException(null, 400, 'INVALID_RETURN_QTY');

        const baseQty = this.roundQty(qty * factor);

        const unitPrice = this.roundMoney(Number(line.unitPrice ?? 0));
        const lineTotalBeforeDiscount = this.roundMoney(unitPrice * qty);
        totalGoods = this.roundMoney(totalGoods + lineTotalBeforeDiscount);

        const log = em.getRepository(PurchaseReturnLog).create({
          purchaseReturn: savedHeader,
          receipt: null,
          receiptItem: null,
          item: inv,
          quantity: qty,
          conversionToBase: factor,
          baseQty,
          reason: dto.reason ?? undefined,
          unitPrice,
          lineTotalBeforeDiscount,
          globalDiscountAllocated: 0,
          lineTotalAfterDiscount: 0,
          refundAmount: 0,
          inventoryTx: null,
          performedBy: user ?? undefined,
        } as any) as unknown as PurchaseReturnLog;
        createdLogs.push(log);
      }
      const discountAmount = this.computeDiscountFromType(totalGoods, (dto as any).discountType, (dto as any).discountValue);
      const allocs = this.allocateDiscount(createdLogs.map(l => this.roundMoney(l.lineTotalBeforeDiscount)), discountAmount);
      createdLogs.forEach((l, i) => {
        l.globalDiscountAllocated = allocs[i];
        const afterLine = this.roundMoney(l.lineTotalBeforeDiscount);
        l.lineTotalAfterDiscount = this.roundMoney(afterLine - l.globalDiscountAllocated);
        l.refundAmount = l.lineTotalAfterDiscount;
      });

      await em.getRepository(PurchaseReturnLog).save(createdLogs);
      const totalAfterDiscount = this.roundMoney(totalGoods - discountAmount);
      savedHeader.totalGoods = totalGoods;
      savedHeader.discount = discountAmount;
      savedHeader.totalAfterDiscount = totalAfterDiscount;
      savedHeader.refundAmount = totalAfterDiscount;
      const paidAmtDraft = (dto as any).paidAmount !== undefined ? this.roundMoney(Number((dto as any).paidAmount ?? 0)) : 0;
      if (paidAmtDraft < 0) throw new ResponseException(null, 400, 'INVALID_PAID_AMOUNT');
      if (paidAmtDraft > totalAfterDiscount) throw new ResponseException(null, 400, 'PAID_AMOUNT_EXCEEDS_REFUND');
      savedHeader.paidAmount = paidAmtDraft;
      await em.getRepository(PurchaseReturn).save(savedHeader);

      return {
        id: savedHeader.id,
        code: savedHeader.code,
        supplierId: savedHeader.supplier.id,
        status: savedHeader.status,
        totalGoods,
        discount: savedHeader.discount,
        totalAfterDiscount,
        refundAmount: savedHeader.refundAmount,
        logs: createdLogs.map(l => ({
          itemId: (l.item as any)?.id ?? l.item,
          quantity: Number(l.quantity),
          conversionToBase: Number(l.conversionToBase),
          baseQty: Number(l.baseQty),
          unitPrice: Number(l.unitPrice),
          lineTotalBeforeDiscount: Number(l.lineTotalBeforeDiscount),
        })),
      };
    });
  }

  async markRefunded(id: string) {
    const pr = await this.prRepo.findOne({ where: { id } });
    if (!pr) throw new ResponseException(null, 404, 'PURCHASE_RETURN_NOT_FOUND');
    if (pr.status === PurchaseReturnStatus.CANCELLED) throw new ResponseException(null, 400, 'ALREADY_CANCELLED');
    pr.status = PurchaseReturnStatus.REFUNDED;
    (pr as any).refundedAt = new Date();
    return this.prRepo.save(pr);
  }

  async changeStatus(id: string, status: PurchaseReturnStatus) {
    // We need to create inventory transactions when posting a DRAFT
    const pr = await this.prRepo.findOne({ where: { id } });
    if (!pr) throw new ResponseException(null, 404, 'PURCHASE_RETURN_NOT_FOUND');
    if (pr.status === status) throw new ResponseException(null, 400, 'ALREADY_IN_DESIRED_STATUS');

    // Only allow posting a draft
    if (status !== PurchaseReturnStatus.POSTED) {
      throw new ResponseException(null, 400, 'ONLY_DRAFT_TO_POSTED_ALLOWED');
    }
    if (pr.status !== PurchaseReturnStatus.DRAFT) {
      throw new ResponseException(null, 400, 'ONLY_DRAFT_CAN_BE_POSTED');
    }

    // perform posting inside a transaction: update inventory, create inventory txs and attach to logs
    return this.ds.transaction(async (em) => {
      const prTx = await em.getRepository(PurchaseReturn).findOne({ where: { id }, relations: ['logs', 'logs.item', 'createdBy'] });
      if (!prTx) throw new ResponseException(null, 404, 'PURCHASE_RETURN_NOT_FOUND_IN_TX');

      const logs = prTx.logs ?? [];
      if (!logs.length) {
        // nothing to post, but still mark as posted
        prTx.status = PurchaseReturnStatus.POSTED;
        (prTx as any).postedAt = new Date();
        return em.getRepository(PurchaseReturn).save(prTx);
      }

      // load inventory items involved
      const invIds = logs.map(l => (l.item as any)?.id ?? l.item).filter(Boolean as any) as string[];
      const invs = await em.getRepository(InventoryItem).find({ where: { id: In(invIds) } });
      const invMap = new Map(invs.map(x => [x.id, x]));

      const savedTxs: InventoryTransaction[] = [];
      for (const log of logs) {
        // Skip if already has an inventory tx (shouldn't happen for DRAFT)
        if ((log as any).inventoryTx) continue;

        const invId = (log.item as any)?.id ?? log.item;
        const inv = invMap.get(invId as string);
        if (!inv) throw new ResponseException(null, 404, `ONE_OR_MORE_ITEMS_NOT_FOUND:${invId}`);

        const baseQty = Number(log.baseQty ?? 0);
        const before = Number(inv.quantity ?? 0);
        if (before + 1e-6 < baseQty) throw new ResponseException(null, 400, `INSUFFICIENT_STOCK_FOR_RETURN:${inv.id}`);
        const after = this.roundQty(before - baseQty);
        inv.quantity = after as any;
        await em.getRepository(InventoryItem).save(inv);

        const tx = em.getRepository(InventoryTransaction).create({
          item: { id: inv.id } as any,
          quantity: baseQty,
          action: InventoryAction.OUT,
          beforeQty: before,
          afterQty: after,
          refType: 'PURCHASE_RETURN',
          refId: prTx.id,
          refItemId: null,
          note: prTx.note ?? undefined,
          performedBy: prTx.createdBy ? ({ id: prTx.createdBy.id } as any) : null,
        } as any);
        const savedTx = await em.getRepository(InventoryTransaction).save(tx as any);
        savedTxs.push(savedTx);

        // attach tx to log
        (log as any).inventoryTx = savedTx;
      }

      // persist updated logs (attach inventoryTx)
      if (logs.length) await em.getRepository(PurchaseReturnLog).save(logs as any);

      prTx.status = PurchaseReturnStatus.POSTED;
      (prTx as any).postedAt = new Date();
      await em.getRepository(PurchaseReturn).save(prTx);

      return prTx;
    });
  }

  async getOne(id: string) {
    const pr = await this.prRepo.findOne({
      where: { id },
      relations: ['supplier', 'logs', 'logs.item'],
    });
    if (!pr) throw new ResponseException(null, 404, 'PURCHASE_RETURN_NOT_FOUND');
    return pr;
  }

  async findAll(params: {
    supplierId?: string;
    status?: PurchaseReturnStatus;
    page?: number;
    limit?: number;
  }) {
    try {
      // Chuẩn hóa & clamp tham số
      const pageNum = Number(params.page);
      const limitNum = Number(params.limit);

      const page = Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1;
      const limit = Number.isFinite(limitNum)
        ? Math.min(Math.max(1, Math.floor(limitNum)), 100)
        : 20;
      const skip = (page - 1) * limit;

      const qb = this.prRepo
        .createQueryBuilder('pr')
        .leftJoinAndSelect('pr.supplier', 's')
        .select(['pr', 's.id', 's.name'])
        .orderBy('pr.createdAt', 'DESC')
        .addOrderBy('pr.id', 'DESC')

      // Filters
      if (params.supplierId) {
        qb.andWhere('s.id = :sid', { sid: params.supplierId });
      }
      if (params.status != null) {
        qb.andWhere('pr.status = :st', { st: params.status });
      }

      // Pagination
      qb.skip(skip).take(limit);

      const [items, total] = await qb.getManyAndCount();

      return new ResponseCommon<typeof items, PageMeta>(
        200,
        true,
        'Lấy danh sách phiếu trả hàng thành công',
        items,
        {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 0,
        },
      );
    } catch (error) {
      throw new ResponseException(error, 500, 'CANNOT_GET_PURCHASE_RETURNS');
    }
  }

  async update(id: string, userId: string, dto: UpdateStandaloneReturnDto) {
    const pr = await this.prRepo.findOne({ where: { id }, relations: ['supplier', 'logs', 'logs.item'] });
    if (!pr) throw new ResponseException(null, 404, 'PURCHASE_RETURN_NOT_FOUND');

    if (pr.status === PurchaseReturnStatus.DRAFT) {
      return this.ds.transaction(async (em) => {
        // ✅ reload pr bằng em (trong transaction)
        const prTx = await em.getRepository(PurchaseReturn).findOne({
          where: { id: pr.id },
        });
        if (!prTx) throw new ResponseException(null, 404, 'PURCHASE_RETURN_NOT_FOUND_IN_TX');

        const user = userId ? await em.getRepository(User).findOne({ where: { id: userId } }) : null;

        // resolve supplier
        let supplier = prTx.supplier;
        if (dto.supplierId) {
          const sup = await em.getRepository(Supplier).findOne({ where: { id: dto.supplierId } });
          if (!sup) throw new ResponseException(null, 404, 'SUPPLIER_NOT_FOUND');
          supplier = sup;
        }

        let totalGoods = 0;
        const createdLogs: PurchaseReturnLog[] = [];

        if (dto.items && dto.items.length) {
          const invIds = dto.items.map(i => {
            if (!i.itemId) throw new ResponseException(null, 400, 'INVALID_ITEM_ID');
            return i.itemId;
          });

          const invs = await em.getRepository(InventoryItem).find({
            where: { id: In(invIds) },
            relations: ['baseUom'],
          });
          if (invs.length !== invIds.length) throw new ResponseException(null, 404, 'ONE_OR_MORE_ITEMS_NOT_FOUND');
          const invMap = new Map(invs.map(x => [x.id, x]));

          // xóa logs cũ (nếu có)
          const oldLogs = await em.getRepository(PurchaseReturnLog).find({ where: { purchaseReturn: { id: prTx.id } } });
          if (oldLogs.length) {
            await em.getRepository(PurchaseReturnLog).remove(oldLogs); // dùng remove để chạy hook/cascade chuẩn
          }

          for (const line of dto.items) {
            const inv = invMap.get(line.itemId as string)!;

            let receivedUomCode = (line as any).receivedUomCode ?? null;
            let factor = 1;
            try {
              // conversionToBase removed from DTO
              const res = await resolveUomAndFactor(
                em,
                (inv as any).baseUom?.code,
                receivedUomCode,
                null,
              );
              receivedUomCode = res.received.code;
              factor = res.factor;
            } catch (err: any) {
              const msg = String(err?.message || err);
              if (msg === 'BASE_UOM_NOT_FOUND') throw new ResponseException(null, 400, `BASE_UOM_NOT_FOUND_FOR_ITEM:${inv.id}`);
              if (msg === 'RECEIVED_UOM_NOT_FOUND') throw new ResponseException(null, 400, `RECEIVED_UOM_NOT_FOUND_FOR_ITEM:${inv.id}`);
              if (msg === 'UOM_DIMENSION_MISMATCH') throw new ResponseException(null, 400, `UOM_DIMENSION_MISMATCH_FOR_ITEM:${inv.id}`);
              if (msg === 'NO_CONVERSION_DEFINED') throw new ResponseException(null, 400, `NO_CONVERSION_DEFINED_FOR_ITEM:${inv.id}`);
              throw new ResponseException(null, 400, `UOM_ERROR_FOR_ITEM:${inv.id}`);
            }

            const qty = Number(line.quantity ?? 0);
            if (!(qty > 0)) throw new ResponseException(null, 400, 'INVALID_RETURN_QTY');

            const baseQty = this.roundQty(qty * factor);
            const unitPrice = this.roundMoney(Number(line.unitPrice ?? 0));
            const lineTotalBeforeDiscount = this.roundMoney(unitPrice * qty);
            totalGoods = this.roundMoney(totalGoods + lineTotalBeforeDiscount);

            // ✅ dùng prTx (managed by em) để set quan hệ
            const log = em.getRepository(PurchaseReturnLog).create({
              purchaseReturn: prTx,
              receipt: null,
              receiptItem: null,
              item: inv,
              quantity: qty,
              conversionToBase: factor,
              baseQty,
              reason: dto.reason ?? prTx.note ?? undefined,
              unitPrice,
              lineTotalBeforeDiscount,
              globalDiscountAllocated: 0,
              lineTotalAfterDiscount: 0,
              refundAmount: 0,
              inventoryTx: null,
              performedBy: user ?? undefined,
            } as any) as unknown as PurchaseReturnLog;
            createdLogs.push(log);
          }

          const discountForAlloc = (dto as any).discountType !== undefined || (dto as any).discountValue !== undefined
            ? this.computeDiscountFromType(totalGoods, (dto as any).discountType, (dto as any).discountValue)
            : this.roundMoney(prTx.discount ?? 0);
          const allocs = this.allocateDiscount(
            createdLogs.map(l => this.roundMoney(l.lineTotalBeforeDiscount)),
            discountForAlloc,
          );
          createdLogs.forEach((l, i) => {
            l.globalDiscountAllocated = allocs[i];
            const afterLine = this.roundMoney(l.lineTotalBeforeDiscount);
            l.lineTotalAfterDiscount = this.roundMoney(afterLine - l.globalDiscountAllocated);
            l.refundAmount = l.lineTotalAfterDiscount;
          });

          await em.getRepository(PurchaseReturnLog).save(createdLogs);
        } else {
          totalGoods = prTx.totalGoods ?? 0;
        }

        const discount = (dto as any).discountType !== undefined || (dto as any).discountValue !== undefined
          ? this.computeDiscountFromType(totalGoods, (dto as any).discountType, (dto as any).discountValue)
          : this.roundMoney(prTx.discount ?? 0);
        const totalAfterDiscount = this.roundMoney(totalGoods - discount);

        prTx.supplier = supplier;
        prTx.note = dto.reason ?? prTx.note;
        prTx.discount = discount;
        prTx.totalGoods = totalGoods;
        prTx.totalAfterDiscount = totalAfterDiscount;
        prTx.refundAmount = totalAfterDiscount;

        // handle paidAmount when editing a draft
        if ((dto as any).paidAmount !== undefined) {
          const paidInput = this.roundMoney(Number((dto as any).paidAmount ?? 0));
          if (paidInput < 0) throw new ResponseException(null, 400, 'INVALID_PAID_AMOUNT');
          if (paidInput > totalAfterDiscount) throw new ResponseException(null, 400, 'PAID_AMOUNT_EXCEEDS_REFUND');
          prTx.paidAmount = paidInput;
        } else {
          // ensure existing paid amount does not exceed new refund
          const existingPaid = this.roundMoney(Number(prTx.paidAmount ?? 0));
          if (existingPaid > totalAfterDiscount) throw new ResponseException(null, 400, 'PAID_AMOUNT_EXCEEDS_REFUND');
        }

        return em.getRepository(PurchaseReturn).save(prTx);
      });
    }
    if (pr.status === PurchaseReturnStatus.POSTED) {
      const forbidden = ['items', 'supplierId', 'reason', 'discount'];
      for (const k of forbidden) {
        if ((dto as any)[k] !== undefined) {
          throw new ResponseException(null, 400, 'CANNOT_UPDATE_POSTED_OTHER_THAN_REFUND_AMOUNT');
        }
      }

      // allow updating refundAmount and/or paidAmount on posted records
      if ((dto as any).refundAmount == null && (dto as any).paidAmount == null) {
        throw new ResponseException(null, 400, 'MUST_PROVIDE_REFUND_OR_PAID_AMOUNT');
      }

      const ra = (dto as any).refundAmount != null ? this.roundMoney(Number((dto as any).refundAmount ?? 0)) : this.roundMoney(Number(pr.refundAmount ?? 0));
      if (ra < 0) throw new ResponseException(null, 400, 'INVALID_REFUND_AMOUNT');

      const pa = (dto as any).paidAmount != null ? this.roundMoney(Number((dto as any).paidAmount ?? 0)) : this.roundMoney(Number(pr.paidAmount ?? 0));
      if (pa < 0) throw new ResponseException(null, 400, 'INVALID_PAID_AMOUNT');

      if (pa > ra) throw new ResponseException(null, 400, 'PAID_AMOUNT_EXCEEDS_REFUND');

      pr.refundAmount = ra;
      pr.paidAmount = pa;
      return this.prRepo.save(pr);
    }
    throw new ResponseException(null, 400, 'CANNOT_UPDATE_IN_CURRENT_STATUS');
  }

  private async genCode(em: any): Promise<string> {
    const prefix = 'THN';
    const d = new Date();
    const base = `${prefix}${d.getFullYear().toString().slice(-2)}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
    const count = await em.getRepository(PurchaseReturn)
      .createQueryBuilder('r')
      .where('r.code LIKE :base', { base: `${base}%` })
      .getCount();
    return `${base}${(count + 1).toString().padStart(3, '0')}`;
  }


}

