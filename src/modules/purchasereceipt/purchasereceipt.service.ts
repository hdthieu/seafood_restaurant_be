import { Injectable } from '@nestjs/common';
import { CreatePurchaseReceiptDto } from './dto/create-purchasereceipt.dto';
import { PurchaseReceipt } from './entities/purchasereceipt.entity';
import { ResponseException } from 'src/common/common_dto/respone.dto';
import { DataSource, DeepPartial, Repository } from 'typeorm';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DiscountType, InventoryAction, ReceiptStatus } from 'src/common/enums';
import { v4 as uuidv4 } from 'uuid';
import { In } from 'typeorm';
import { calcLineTotal, calcReceiptTotals, resolveUomAndFactor } from '@modules/helper/purchasereceipthelper.service';
import { PayReceiptDto } from './dto/pay-receipt.dto';
import { InventoryTransaction } from '@modules/inventorytransaction/entities/inventorytransaction.entity';
import { UpdatePurchaseReceiptDto } from './dto/update-purchasereceipt.dto';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';
import { CashbookService } from '@modules/cashbook/cashbook.service';
import { ReturnReceiptDto } from '../purchasereturn/dto/return-receipt.dto';
@Injectable()
export class PurchasereceiptService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(PurchaseReceipt) private readonly receiptRepo: Repository<PurchaseReceipt>,
    @InjectRepository(PurchaseReceiptItem) private readonly itemRepo: Repository<PurchaseReceiptItem>,
    @InjectRepository(InventoryItem) private readonly invRepo: Repository<InventoryItem>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(InventoryTransaction) private readonly txRepo: Repository<InventoryTransaction>,
    @InjectRepository(UnitsOfMeasure) private readonly uomRepo: Repository<UnitsOfMeasure>,
    @InjectRepository(UomConversion) private readonly convRepo: Repository<UomConversion>,
    private readonly cashbookService: CashbookService,
  ) { }

  /** PN-yyyymmdd-XXXX */
  private buildCode(): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `PN-${ymd}-${uuidv4().slice(0, 4).toUpperCase()}`;
  }

  /** Tạo phiếu DRAFT + items */
  async createDraft(userId: string, dto: CreatePurchaseReceiptDto) {
    // 1) Header
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
    if (!supplier) throw new ResponseException(null, 404, 'SUPPLIER_NOT_FOUND');

    // 2) Validate items cơ bản
    if (dto.globalDiscountType === DiscountType.PERCENT && (dto.globalDiscountValue ?? 0) > 100) {
      throw new ResponseException(null, 400, 'GLOBAL_PERCENT_OUT_OF_RANGE');
    }
    dto.items.forEach((it, idx) => {
      if (it.discountType === DiscountType.PERCENT && (it.discountValue ?? 0) > 100) {
        throw new ResponseException(null, 400, `LINE_PERCENT_OUT_OF_RANGE_AT_${idx + 1}`);
      }
      if (!it.quantity || it.quantity <= 0) {
        throw new ResponseException(null, 400, `INVALID_QTY_AT_${idx + 1}`);
      }
      if (it.unitPrice == null || it.unitPrice < 0) {
        throw new ResponseException(null, 400, `INVALID_PRICE_AT_${idx + 1}`);
      }
    });

    // 3) Chặn trùng lô (cùng SP + ĐVT + lô)
    const norm = (s?: string) => (s ?? '').trim().toUpperCase();
    const dupKey = new Set<string>();
    dto.items.forEach((it, idx) => {
      const lot = norm(it.lotNumber);
      if (!lot) return; // không nhập lô thì cho phép (tuỳ nghiệp vụ)
      const key = [it.itemId, norm(it.receivedUomCode), lot].join('|');
      if (dupKey.has(key)) throw new ResponseException(null, 400, `DUPLICATE_LOT_AT_${idx + 1}`);
      dupKey.add(key);
    });

    // 4) Tải InventoryItem theo danh sách ID duy nhất
    const ids = dto.items.map(i => i.itemId);
    const uniqIds = Array.from(new Set(ids));
    const invItems = await this.invRepo.find({
      where: { id: In(uniqIds) },
      relations: ['baseUom'],
    });
    if (invItems.length !== uniqIds.length) {
      const found = new Set(invItems.map(i => i.id));
      const missing = uniqIds.filter(id => !found.has(id));
      throw new ResponseException(null, 404, `SOME_ITEMS_NOT_FOUND:${missing.join(',')}`);
    }
    const itemMap = new Map(invItems.map(i => [i.id, i]));

    const code = this.buildCode();

    // 5) Transaction
    return this.ds.transaction(async (em) => {
      const receiptRepo = em.getRepository(PurchaseReceipt);
      const lineRepo = em.getRepository(PurchaseReceiptItem);

      const receipt = receiptRepo.create({
        code,
        supplier,
        receiptDate: dto.receiptDate,
        status: ReceiptStatus.DRAFT,
        globalDiscountType: dto.globalDiscountType ?? DiscountType.AMOUNT,
        globalDiscountValue: dto.globalDiscountValue ?? 0,
        shippingFee: dto.shippingFee ?? 0,
        amountPaid: dto.amountPaid ?? 0,
        note: dto.note ?? null,
        createdBy: { id: userId } as any,
      });
      await receiptRepo.save(receipt);

      let lineNo = 1;
      const saved: PurchaseReceiptItem[] = [];

      for (const it of dto.items) {
        const item = itemMap.get(it.itemId)!; // đã validate ở trên

        // === Tra UOM & conversion bằng helper (đồng nhất với các hàm khác) ===
        let receivedUomCode = it.receivedUomCode ?? null;
        let factor = 1;
        let receivedName = '';
        try {
          const res = await resolveUomAndFactor(
            em,
            item.baseUom.code,         // base của item
            receivedUomCode,           // UOM FE chọn (có thể null -> dùng base)
            it.conversionToBase ?? null,
          );
          receivedUomCode = res.received.code;
          receivedName = res.received.name;
          factor = res.factor;
        } catch (err: any) {
          const msg = String(err?.message || err);
          if (msg === 'BASE_UOM_NOT_FOUND') throw new ResponseException(null, 400, `BASE_UOM_NOT_FOUND_AT_${lineNo}`);
          if (msg === 'RECEIVED_UOM_NOT_FOUND') throw new ResponseException(null, 400, `RECEIVED_UOM_NOT_FOUND_AT_${lineNo}`);
          if (msg === 'UOM_DIMENSION_MISMATCH') throw new ResponseException(null, 400, `UOM_DIMENSION_MISMATCH_AT_${lineNo}`);
          if (msg === 'NO_CONVERSION_DEFINED') throw new ResponseException(null, 400, `NO_CONVERSION_DEFINED_AT_${lineNo}`);
          throw new ResponseException(null, 400, `UOM_ERROR_AT_${lineNo}`);
        }

        const line = lineRepo.create({
          receipt: { id: receipt.id } as any,
          item: { id: item.id } as any,
          lineNo: lineNo++,
          quantity: Number(it.quantity),
          receivedUom: { code: receivedUomCode } as any,
          conversionToBase: Number(factor),
          unitPrice: Number(it.unitPrice),
          discountType: it.discountType ?? DiscountType.AMOUNT,
          discountValue: Number(it.discountValue ?? 0),
          lotNumber: it.lotNumber ?? undefined,
          expiryDate: it.expiryDate ?? undefined,
          note: it.note ?? undefined,
        });
        await lineRepo.save(line);

        // nhét name để trả response đẹp
        (line as any).__receivedUomName = receivedName;
        saved.push(line);
      }

      // 6) Tính tổng
      const subTotal = saved.reduce((sum, i) => {
        const qty = Number(i.quantity);
        const price = Number(i.unitPrice);
        const disc = Number(i.discountValue ?? 0);
        const priceAfter =
          i.discountType === DiscountType.PERCENT ? price * (1 - disc / 100) : price - disc;
        return sum + Math.max(0, qty * priceAfter);
      }, 0);

      const gType = receipt.globalDiscountType;
      const gVal = Number(receipt.globalDiscountValue ?? 0);
      const ship = Number(receipt.shippingFee ?? 0);
      const paid = Number(receipt.amountPaid ?? 0);

      const afterGlobal = gType === DiscountType.PERCENT ? subTotal * (1 - gVal / 100) : subTotal - gVal;
      const grandTotal = Math.max(0, +(afterGlobal + ship).toFixed(2));
      const remaining = Math.max(0, +(grandTotal - paid).toFixed(2));

      // 7) Response
      return {
        id: receipt.id,
        code: receipt.code,
        status: receipt.status,
        supplier: { id: supplier.id, name: supplier.name },
        receiptDate: receipt.receiptDate,
        subTotal: +subTotal.toFixed(2),
        grandTotal,
        shippingFee: +ship.toFixed(2),
        amountPaid: +paid.toFixed(2),
        remaining,
        items: saved.map(i => ({
          id: i.id,
          lineNo: i.lineNo!,
          itemId: (i.item as any)?.id ?? i.item,
          itemName: undefined, // nếu cần, join thêm
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discountType: i.discountType,
          discountValue: Number(i.discountValue),
          receivedUomCode: (i.receivedUom as any)?.code ?? i.receivedUom,
          receivedUomName: (i as any).__receivedUomName ?? null,
          conversionToBase: Number(i.conversionToBase),
          lotNumber: i.lotNumber ?? null,
          expiryDate: i.expiryDate ?? null,
          lineTotal: ((): number => {
            const price = Number(i.unitPrice);
            const disc = Number(i.discountValue ?? 0);
            const priceAfter =
              i.discountType === DiscountType.PERCENT ? price * (1 - disc / 100) : price - disc;
            return Math.max(0, Number(i.quantity) * priceAfter);
          })(),
        })),
      };
    });
  }



  // this function is used to get detail of a receipt by id
  async getDetail(id: string) {
    const r = await this.receiptRepo.findOne({
      where: { id },
      relations: [
        'supplier',
        'items',
        'items.item',
        'items.receivedUom',
      ],
    });
    if (!r) throw new ResponseException(null, 404, 'RECEIPT_NOT_FOUND');

    const totals = calcReceiptTotals(r.items, r);

    return {
      id: r.id,
      code: r.code,
      status: r.status,
      supplier: { id: r.supplier.id, name: r.supplier.name },
      receiptDate: r.receiptDate,
      shippingFee: Number(r.shippingFee),
      amountPaid: Number(r.amountPaid),
      globalDiscountType: r.globalDiscountType,
      globalDiscountValue: Number(r.globalDiscountValue),
      note: r.note,
      subTotal: totals.subTotal,
      grandTotal: totals.total,
      debt: Number(r.debt),
      remaining: Number(r.debt),
      items: r.items.map(i => ({
        id: i.id,
        itemId: i.item.id,
        itemName: i.item.name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discountType: i.discountType,
        discountValue: Number(i.discountValue),
        receivedUomCode: i.receivedUom?.code ?? null,
        receivedUomName: i.receivedUom?.name ?? null,
        conversionToBase: Number(i.conversionToBase),
        baseQty: Number(i.quantity) * Number(i.conversionToBase),
        lotNumber: i.lotNumber ?? null,
        expiryDate: i.expiryDate ?? null,
        lineTotal: calcLineTotal(i),
      })),
    };
  }

  // this endpoint is used to get list of receipts with pagination
  async getList(page: number = 1, limit: number = 10): Promise<any> {
    const [receipts, total] = await this.receiptRepo.findAndCount({
      relations: ['supplier'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: receipts.map(r => ({
        id: r.id,
        code: r.code,
        status: r.status,
        supplier: r.supplier ? { id: r.supplier.id, name: r.supplier.name } : null,
        receiptDate: r.receiptDate,
        shippingFee: Number(r.shippingFee),
        amountPaid: Number(r.amountPaid),
        globalDiscountType: r.globalDiscountType,
        globalDiscountValue: Number(r.globalDiscountValue),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        debt: Number(r.debt),
        remaining: Number(r.debt),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

  }

  async createAndPost(userId: string, dto: CreatePurchaseReceiptDto) {
    // 1) Validate header
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
    if (!supplier) throw new ResponseException(null, 404, 'SUPPLIER_NOT_FOUND');

    // --- VALIDATE items cơ bản ---
    if (dto.globalDiscountType === DiscountType.PERCENT && (dto.globalDiscountValue ?? 0) > 100) {
      throw new ResponseException(null, 400, 'GLOBAL_PERCENT_OUT_OF_RANGE');
    }

    dto.items.forEach((it, idx) => {
      if (it.discountType === DiscountType.PERCENT && (it.discountValue ?? 0) > 100) {
        throw new ResponseException(null, 400, `LINE_PERCENT_OUT_OF_RANGE_AT_${idx + 1}`);
      }
      if (!it.quantity || it.quantity <= 0) {
        throw new ResponseException(null, 400, `INVALID_QTY_AT_${idx + 1}`);
      }
      if (it.unitPrice == null || it.unitPrice < 0) {
        throw new ResponseException(null, 400, `INVALID_PRICE_AT_${idx + 1}`);
      }
    });

    // --- CHẶN TRÙNG LÔ theo (itemId + receivedUomCode + lotNumber) ---
    const norm = (s?: string) => (s ?? '').trim().toUpperCase();
    const dupKey = new Set<string>();
    dto.items.forEach((it, idx) => {
      const lot = norm(it.lotNumber);
      if (!lot) return; // không nhập lô thì cho phép trùng (tuỳ nghiệp vụ)
      const key = [it.itemId, norm(it.receivedUomCode), lot].join('|');
      if (dupKey.has(key)) throw new ResponseException(null, 400, `DUPLICATE_LOT_AT_${idx + 1}`);
      dupKey.add(key);
    });

    // --- TẢI INVENTORY ITEMS bằng danh sách ID DUY NHẤT ---
    const ids = dto.items.map(i => i.itemId);
    const uniqIds = Array.from(new Set(ids));
    const invItems = await this.invRepo.find({
      where: { id: In(uniqIds) },
      relations: ['baseUom'],
    });
    if (invItems.length !== uniqIds.length) {
      const found = new Set(invItems.map(i => i.id));
      const missing = uniqIds.filter(id => !found.has(id));
      throw new ResponseException(null, 404, `SOME_ITEMS_NOT_FOUND:${missing.join(',')}`);
    }
    const itemMap = new Map(invItems.map(i => [i.id, i]));

    const code = this.buildCode();

    // === TRANSACTION ===
    return this.ds.transaction(async (em) => {
      const receiptRepo = em.getRepository(PurchaseReceipt);
      const lineRepo = em.getRepository(PurchaseReceiptItem);
      const invRepo = em.getRepository(InventoryItem);
      const txRepo = em.getRepository(InventoryTransaction);

      // 2) Tạo receipt (POSTED, set PAID/OWING ở cuối)
      const receipt = receiptRepo.create({
        code,
        supplier,
        receiptDate: dto.receiptDate,
        status: ReceiptStatus.POSTED,
        globalDiscountType: dto.globalDiscountType ?? DiscountType.AMOUNT,
        globalDiscountValue: dto.globalDiscountValue ?? 0,
        shippingFee: dto.shippingFee ?? 0,
        amountPaid: dto.amountPaid ?? 0,
        note: dto.note ?? null,
        createdBy: { id: userId } as any,
        debt: 0,
      });
      await receiptRepo.save(receipt);

      // 3) Lưu từng dòng + cập nhật tồn/avg + transaction
      let lineNo = 1;
      const savedLines: PurchaseReceiptItem[] = [];

      for (const it of dto.items) {
        const itemMaster = itemMap.get(it.itemId)!; // đã validate

        // resolve UOM & factor
        let receivedUomCode = it.receivedUomCode ?? null;
        let factor = 1;
        try {
          const res = await resolveUomAndFactor(
            em,
            itemMaster.baseUom.code,
            receivedUomCode,
            it.conversionToBase ?? null,
          );
          receivedUomCode = res.received.code;
          factor = res.factor;
        } catch (err: any) {
          const msg = String(err?.message || err);
          if (msg === 'BASE_UOM_NOT_FOUND') throw new ResponseException(null, 400, `BASE_UOM_NOT_FOUND_AT_${lineNo}`);
          if (msg === 'RECEIVED_UOM_NOT_FOUND') throw new ResponseException(null, 400, `RECEIVED_UOM_NOT_FOUND_AT_${lineNo}`);
          if (msg === 'UOM_DIMENSION_MISMATCH') throw new ResponseException(null, 400, `UOM_DIMENSION_MISMATCH_AT_${lineNo}`);
          if (msg === 'NO_CONVERSION_DEFINED') throw new ResponseException(null, 400, `NO_CONVERSION_DEFINED_AT_${lineNo}`);
          throw new ResponseException(null, 400, `UOM_ERROR_AT_${lineNo}`);
        }

        const line = lineRepo.create({
          receipt: { id: receipt.id } as any,
          item: { id: itemMaster.id } as any,
          lineNo: lineNo++,
          quantity: it.quantity,
          receivedUom: { code: receivedUomCode } as any,
          conversionToBase: factor,
          unitPrice: it.unitPrice,
          discountType: it.discountType ?? DiscountType.AMOUNT,
          discountValue: it.discountValue ?? 0,
          lotNumber: it.lotNumber ?? undefined,
          expiryDate: it.expiryDate ?? undefined,
          note: it.note ?? undefined,
        });
        await lineRepo.save(line);

        // Liên kết item với supplier vào bảng join inventory_item_suppliers (nếu chưa tồn tại)
        await em.query(
          `INSERT INTO "inventory_item_suppliers"("inventoryItemsId","suppliersId")
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM "inventory_item_suppliers"
             WHERE "inventoryItemsId" = $1 AND "suppliersId" = $2
           )`,
          [itemMaster.id, supplier.id],
        );

        // cập nhật tồn theo base
        const baseQty = Number(line.quantity) * Number(line.conversionToBase);
        const unitCostBase = Number(line.unitPrice) / Number(line.conversionToBase);

        const inv = await invRepo.findOne({ where: { id: itemMaster.id } });
        if (!inv) throw new ResponseException(null, 404, 'ITEM_NOT_FOUND');

        const before = Number(inv.quantity);
        const oldVal = before * Number(inv.avgCost);
        const after = before + baseQty;
        const newAvg = after > 0 ? (oldVal + baseQty * unitCostBase) / after : unitCostBase;

        inv.quantity = Number(after.toFixed(3));
        inv.avgCost = Number(newAvg.toFixed(2));
        await invRepo.save(inv);

        await txRepo.save(txRepo.create([{
          item: { id: inv.id } as any,
          quantity: baseQty,
          action: InventoryAction.IMPORT,
          unitCost: unitCostBase,
          lineCost: Number((unitCostBase * baseQty).toFixed(2)),
          beforeQty: before,
          afterQty: inv.quantity,
          refType: 'PURCHASE_RECEIPT',
          refId: receipt.id as any,
          refItemId: line.id as any,
          note: line.note ?? null,
          performedBy: userId ? ({ id: userId } as any) : null,
        } as DeepPartial<InventoryTransaction>]));

        savedLines.push(line);
      }

      // 4) Tổng & trạng thái
      const totals = calcReceiptTotals(savedLines as any, receipt);
      const grandTotal = +Number(totals.total).toFixed(2);
      const paidNow = +Number(receipt.amountPaid ?? 0).toFixed(2);

      if (paidNow < 0) throw new ResponseException(null, 400, 'INVALID_PAYMENT_AMOUNT');
      if (paidNow > grandTotal) throw new ResponseException(null, 400, 'OVERPAY_NOT_ALLOWED');

      const remaining = Math.max(0, +(grandTotal - paidNow).toFixed(2));
      receipt.debt = remaining;
      receipt.status = remaining === 0 ? ReceiptStatus.PAID : ReceiptStatus.OWING;
      await receiptRepo.save(receipt);

      // Nếu có trả tiền ngay, tạo phiếu thu tương ứng
      if (paidNow > 0) {
        await this.cashbookService.postPaymentFromPurchase(em, receipt, paidNow);
      }

      // 5) Response
      return {
        id: receipt.id,
        code: receipt.code,
        status: receipt.status,
        supplier: { id: supplier.id, name: supplier.name },
        receiptDate: receipt.receiptDate,
        subTotal: totals.subTotal,
        grandTotal,
        shippingFee: Number(receipt.shippingFee),
        amountPaid: Number(receipt.amountPaid),
        remaining,
        items: savedLines.map(i => ({
          id: i.id,
          lineNo: i.lineNo!,
          itemId: (i.item as any)?.id ?? i.item,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discountType: i.discountType,
          discountValue: Number(i.discountValue),
          receivedUomCode: (i.receivedUom as any)?.code ?? i.receivedUom,
          conversionToBase: Number(i.conversionToBase),
          lotNumber: i.lotNumber ?? null,
          expiryDate: i.expiryDate ?? null,
          lineTotal: calcLineTotal(i as any),
        })),
      };
    });
  }


  // this function is used to pay a receipt
  async payReceipt(id: string, dto: PayReceiptDto) {
    return this.ds.transaction(async (em) => {
      const r = await em.getRepository(PurchaseReceipt).findOne({
        where: { id },
        relations: ['items'],
      });
      if (!r) throw new ResponseException(null, 404, 'RECEIPT_NOT_FOUND');

      // Chỉ cho phép thanh toán khi hóa đơn còn nợ
      if (r.status !== ReceiptStatus.POSTED && r.status !== ReceiptStatus.OWING) {
        throw new ResponseException(null, 400, 'ONLY_OWING_OR_POSTED_CAN_BE_PAID');
      }

      // Tổng tiền hóa đơn
      const totals = calcReceiptTotals(r.items, r);
      const grandTotal = +Number(totals.total).toFixed(2);

      const oldPaid = +Number(r.amountPaid || 0).toFixed(2);
      const add = +Number(dto.addAmountPaid || 0).toFixed(2);

      if (add <= 0) {
        throw new ResponseException(null, 400, 'INVALID_PAYMENT_AMOUNT');
      }

      const remainingBefore = Math.max(0, +(grandTotal - oldPaid).toFixed(2));

      // Nếu không còn nợ, không cho phép thêm tiền
      if (remainingBefore === 0) {
        throw new ResponseException(null, 400, 'NO_REMAINING_AMOUNT_TO_PAY');
      }

      // Chặn overpay
      if (add > remainingBefore) {
        throw new ResponseException(null, 400, 'OVERPAY_NOT_ALLOWED');
      }

      const newPaid = +(oldPaid + add).toFixed(2);
      r.amountPaid = newPaid;

      const remaining = Math.max(0, +(grandTotal - newPaid).toFixed(2));
      const paidInFull = remaining === 0;

      // Cập nhật trạng thái hóa đơn và cột debt
      if (paidInFull) {
        r.status = ReceiptStatus.PAID;
        r.debt = 0; // Xóa giá trị trong cột debt khi đã trả hết nợ
      } else {
        r.status = ReceiptStatus.OWING; // Nếu còn nợ, đảm bảo trạng thái là OWING
        r.debt = remaining; // Cập nhật giá trị còn nợ vào cột debt
      }

      await em.save(r);

      return {
        id: r.id,
        status: r.status,        // PAID => hết nợ; OWING => còn nợ
        amountPaid: r.amountPaid,
        grandTotal,
        remaining,
        paidInFull,              // true = hết nợ
      };
    });
  }

  async cancelReceipt(id: string) {
    const r = await this.receiptRepo.findOne({ where: { id } });
    if (!r) throw new ResponseException(null, 404, 'RECEIPT_NOT_FOUND');
    if (r.status !== ReceiptStatus.DRAFT) {
      throw new ResponseException(null, 400, 'ONLY_DRAFT_CAN_BE_CANCELLED');
    }
    r.status = ReceiptStatus.CANCELLED;
    await this.receiptRepo.save(r);
    return { id: r.id, status: r.status };
  }

  async updateDraftOrPost(
    userId: string,
    receiptId: string,
    dto: UpdatePurchaseReceiptDto,
    postNow: boolean,   // true => cập nhật & POST; false => chỉ lưu DRAFT
  ) {
    // 0) Tìm phiếu + chặn sai trạng thái
    const existed = await this.receiptRepo.findOne({
      where: { id: receiptId },
      relations: ['supplier'],
    });
    if (!existed) throw new ResponseException(null, 404, 'RECEIPT_NOT_FOUND');

    if (existed.status !== ReceiptStatus.DRAFT && !postNow) {
      // chỉ cho sửa khi còn DRAFT
      throw new ResponseException(null, 400, 'ONLY_DRAFT_CAN_BE_UPDATED');
    }
    if (existed.status !== ReceiptStatus.DRAFT && postNow) {
      // chỉ cho POST khi đang DRAFT
      throw new ResponseException(null, 400, 'ONLY_DRAFT_CAN_BE_POSTED');
    }

    // 1) Validate header
    let supplier = existed.supplier;
    if (dto.supplierId && dto.supplierId !== existed.supplier?.id) {
      const foundSupplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
      if (!foundSupplier) throw new ResponseException(null, 404, 'SUPPLIER_NOT_FOUND');
      supplier = foundSupplier;
      if (!supplier) throw new ResponseException(null, 404, 'SUPPLIER_NOT_FOUND');
    }

    if (dto.globalDiscountType === DiscountType.PERCENT && (dto.globalDiscountValue ?? 0) > 100) {
      throw new ResponseException(null, 400, 'GLOBAL_PERCENT_OUT_OF_RANGE');
    }

    // 2) Validate items
    const itemsDto = dto.items ?? [];

    // --- trùng lô theo (itemId + receivedUomCode + lotNumber) ---
    const norm = (s?: string) => (s ?? '').trim().toUpperCase();
    const dup = new Set<string>();

    itemsDto.forEach((it, idx) => {
      if (it.discountType === DiscountType.PERCENT && (it.discountValue ?? 0) > 100) {
        throw new ResponseException(null, 400, `LINE_PERCENT_OUT_OF_RANGE_AT_${idx + 1}`);
      }
      if (!it.quantity || it.quantity <= 0) {
        throw new ResponseException(null, 400, `INVALID_QTY_AT_${idx + 1}`);
      }
      if (it.unitPrice == null || it.unitPrice < 0) {
        throw new ResponseException(null, 400, `INVALID_PRICE_AT_${idx + 1}`);
      }

      const lot = norm(it.lotNumber);
      if (!lot) return;
      const key = [it.itemId, norm(it.receivedUomCode), lot].join('|');
      if (dup.has(key)) throw new ResponseException(null, 400, `DUPLICATE_LOT_AT_${idx + 1}`);
      dup.add(key);
    });

    // 3) Chuẩn bị map InventoryItem bằng id duy nhất
    const ids = itemsDto.map(i => i.itemId);
    const uniqIds = Array.from(new Set(ids));
    const invItems = uniqIds.length
      ? await this.invRepo.find({ where: { id: In(uniqIds) }, relations: ['baseUom'] })
      : [];
    if (uniqIds.length && invItems.length !== uniqIds.length) {
      const found = new Set(invItems.map(i => i.id));
      const missing = uniqIds.filter(id => !found.has(id));
      throw new ResponseException(null, 404, `SOME_ITEMS_NOT_FOUND:${missing.join(',')}`);
    }
    const itemMap = new Map(invItems.map(i => [i.id, i]));

    // 4) Transaction
    return this.ds.transaction(async (em) => {
      const receiptRepo = em.getRepository(PurchaseReceipt);
      const lineRepo = em.getRepository(PurchaseReceiptItem);
      const invRepo = em.getRepository(InventoryItem);
      const txRepo = em.getRepository(InventoryTransaction);

      // 4.1 Cập nhật header (vẫn để DRAFT cho tới khi xử lý xong phần items)
      existed.supplier = supplier ?? existed.supplier;
      existed.receiptDate = dto.receiptDate ?? existed.receiptDate;
      existed.globalDiscountType = dto.globalDiscountType ?? existed.globalDiscountType ?? DiscountType.AMOUNT;
      existed.globalDiscountValue = dto.globalDiscountValue ?? existed.globalDiscountValue ?? 0;
      existed.shippingFee = dto.shippingFee ?? existed.shippingFee ?? 0;
      existed.amountPaid = dto.amountPaid ?? existed.amountPaid ?? 0;
      existed.note = dto.note ?? existed.note ?? null;
      // status sẽ set ở cuối
      await receiptRepo.save(existed);

      // 4.2 Replace items nếu client gửi
      let savedLines: PurchaseReceiptItem[] = [];
      if (uniqIds.length) {
        await lineRepo.delete({ receipt: { id: existed.id } as any });

        let lineNo = 1;
        for (const it of itemsDto) {
          const itemMaster = itemMap.get(it.itemId)!;

          let receivedUomCode = it.receivedUomCode ?? null;
          let factor = 1;
          try {
            const res = await resolveUomAndFactor(
              em,
              itemMaster.baseUom.code,
              receivedUomCode,
              it.conversionToBase ?? null,
            );
            receivedUomCode = res.received.code;
            factor = res.factor;
          } catch (err: any) {
            const msg = String(err?.message || err);
            if (msg === 'BASE_UOM_NOT_FOUND') throw new ResponseException(null, 400, `BASE_UOM_NOT_FOUND_AT_${lineNo}`);
            if (msg === 'RECEIVED_UOM_NOT_FOUND') throw new ResponseException(null, 400, `RECEIVED_UOM_NOT_FOUND_AT_${lineNo}`);
            if (msg === 'UOM_DIMENSION_MISMATCH') throw new ResponseException(null, 400, `UOM_DIMENSION_MISMATCH_AT_${lineNo}`);
            if (msg === 'NO_CONVERSION_DEFINED') throw new ResponseException(null, 400, `NO_CONVERSION_DEFINED_AT_${lineNo}`);
            throw new ResponseException(null, 400, `UOM_ERROR_AT_${lineNo}`);
          }

          const line = lineRepo.create({
            receipt: { id: existed.id } as any,
            item: { id: itemMaster.id } as any,
            lineNo: lineNo++,
            quantity: it.quantity,
            receivedUom: { code: receivedUomCode } as any,
            conversionToBase: factor,
            unitPrice: it.unitPrice,
            discountType: it.discountType ?? DiscountType.AMOUNT,
            discountValue: it.discountValue ?? 0,
            lotNumber: it.lotNumber ?? undefined,
            expiryDate: it.expiryDate ?? undefined,
            note: it.note ?? undefined,
          });
          await lineRepo.save(line);
          // Ghi nhận quan hệ item - supplier vào bảng join nếu chưa có (khi cập nhật DRAFT)
          await em.query(
            `INSERT INTO "inventory_item_suppliers"("inventoryItemsId","suppliersId")
             SELECT $1, $2
             WHERE NOT EXISTS (
               SELECT 1 FROM "inventory_item_suppliers"
               WHERE "inventoryItemsId" = $1 AND "suppliersId" = $2
             )`,
            [itemMaster.id, (supplier ?? existed.supplier).id],
          );
          savedLines.push(line);
        }
      } else {
        savedLines = await lineRepo.find({
          where: { receipt: { id: existed.id } as any },
          relations: ['item', 'receivedUom'],
          order: { lineNo: 'ASC' },
        });
      }

      // 4.3 Nếu chỉ LƯU DRAFT: không đụng kho, trả về summary
      if (!postNow) {
        const forTotal = await lineRepo.find({
          where: { receipt: { id: existed.id } as any },
        });
        const totals = calcReceiptTotals(forTotal as any, existed);
        // Giữ trạng thái DRAFT
        existed.status = ReceiptStatus.DRAFT;
        existed.debt = 0; // snapshot nợ không dùng ở DRAFT (tuỳ bạn)
        await receiptRepo.save(existed);

        return {
          id: existed.id,
          code: existed.code,
          status: existed.status,
          supplier: { id: existed.supplier.id, name: existed.supplier.name },
          receiptDate: existed.receiptDate,
          subTotal: totals.subTotal,
          grandTotal: totals.total,
          shippingFee: Number(existed.shippingFee),
          amountPaid: Number(existed.amountPaid),
          remaining: null, // DRAFT chưa chốt
          items: (await lineRepo.find({
            where: { receipt: { id: existed.id } as any },
            relations: ['item', 'receivedUom'],
            order: { lineNo: 'ASC' },
          })).map(i => ({
            id: i.id,
            lineNo: i.lineNo!,
            itemId: (i.item as any)?.id ?? i.item,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            discountType: i.discountType,
            discountValue: Number(i.discountValue),
            receivedUomCode: (i.receivedUom as any)?.code ?? null,
            receivedUomName: (i.receivedUom as any)?.name ?? null,
            conversionToBase: Number(i.conversionToBase),
            lotNumber: i.lotNumber ?? null,
            expiryDate: i.expiryDate ?? null,
            lineTotal: calcLineTotal(i as any),
          })),

        };
      }

      // 4.4 Nếu POST NOW: áp dụng kho + transactions
      const linesToPost = await lineRepo.find({
        where: { receipt: { id: existed.id } as any },
        relations: ['item', 'receivedUom'],
        order: { lineNo: 'ASC' },
      });


      for (const line of linesToPost) {
        const itemId = (line.item as any)?.id ?? line.item;
        const inv = await invRepo.findOne({ where: { id: itemId } });
        if (!inv) throw new ResponseException(null, 404, 'ITEM_NOT_FOUND');

        // Đảm bảo quan hệ item - supplier tồn tại khi POST
        await em.query(
          `INSERT INTO "inventory_item_suppliers"("inventoryItemsId","suppliersId")
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM "inventory_item_suppliers"
             WHERE "inventoryItemsId" = $1 AND "suppliersId" = $2
           )`,
          [inv.id, existed.supplier.id],
        );

        // Đảm bảo quan hệ item-supplier được lưu trong join table
        await em.query(
          `INSERT INTO "inventory_item_suppliers"("inventoryItemsId","suppliersId")
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM "inventory_item_suppliers"
             WHERE "inventoryItemsId" = $1 AND "suppliersId" = $2
           )`,
          [inv.id, existed.supplier.id],
        );

        const baseQty = Number(line.quantity) * Number(line.conversionToBase);
        const unitCostBase = Number(line.unitPrice) / Number(line.conversionToBase);

        const before = Number(inv.quantity);
        const oldVal = before * Number(inv.avgCost);
        const after = before + baseQty;
        const newAvg = after > 0 ? (oldVal + baseQty * unitCostBase) / after : unitCostBase;

        inv.quantity = Number(after.toFixed(3));
        inv.avgCost = Number(newAvg.toFixed(2));
        await invRepo.save(inv);

        await txRepo.save(txRepo.create([{
          item: { id: inv.id } as any,
          quantity: baseQty,
          action: InventoryAction.IMPORT,
          unitCost: unitCostBase,
          lineCost: Number((unitCostBase * baseQty).toFixed(2)),
          beforeQty: before,
          afterQty: inv.quantity,
          refType: 'PURCHASE_RECEIPT',
          refId: existed.id as any,
          refItemId: line.id as any,
          note: line.note ?? null,
          performedBy: userId ? ({ id: userId } as any) : null,
        } as DeepPartial<InventoryTransaction>]));
      }

      // 4.5 Tính tổng & set trạng thái cuối cùng
      const totals = calcReceiptTotals(linesToPost as any, existed);
      const grandTotal = +Number(totals.total).toFixed(2);
      const paidNow = +Number((existed.amountPaid ?? 0)).toFixed(2);

      if (paidNow < 0) throw new ResponseException(null, 400, 'INVALID_PAYMENT_AMOUNT');
      if (paidNow > grandTotal) throw new ResponseException(null, 400, 'OVERPAY_NOT_ALLOWED');

      const remaining = Math.max(0, +(grandTotal - paidNow).toFixed(2));
      existed.debt = remaining;
      existed.status = remaining === 0 ? ReceiptStatus.PAID : ReceiptStatus.OWING;
      await receiptRepo.save(existed);

      if (paidNow > 0) {
        const receipt = await receiptRepo.findOne({ where: { id: receiptId } });
        if (!receipt) {
          throw new ResponseException(null, 404, 'RECEIPT_NOT_FOUND');
        }
        await this.cashbookService.postPaymentFromPurchase(em, receipt, paidNow);
      }

      return {
        id: existed.id,
        code: existed.code,
        status: existed.status,
        supplier: { id: existed.supplier.id, name: existed.supplier.name },
        receiptDate: existed.receiptDate,
        subTotal: totals.subTotal,
        grandTotal,
        shippingFee: Number(existed.shippingFee),
        amountPaid: Number(existed.amountPaid),
        remaining,
        items: linesToPost.map(i => ({
          id: i.id,
          lineNo: i.lineNo!,
          itemId: (i.item as any)?.id ?? i.item,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discountType: i.discountType,
          discountValue: Number(i.discountValue),
          receivedUomCode: (i as any).receivedUom?.code ?? (i as any).receivedUom, // nếu đã load relation
          conversionToBase: Number(i.conversionToBase),
          lotNumber: i.lotNumber ?? null,
          expiryDate: i.expiryDate ?? null,
          lineTotal: calcLineTotal(i as any),
        })),
      };
    });
  }

}
