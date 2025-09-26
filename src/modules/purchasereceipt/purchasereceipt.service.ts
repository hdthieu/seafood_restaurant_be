import { Injectable } from '@nestjs/common';
import { CreatePurchaseReceiptDto } from './dto/create-purchasereceipt.dto';
import { PurchaseReceipt } from './entities/purchasereceipt.entity';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
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
  ) { }

  /** PN-yyyymmdd-XXXX */
  private buildCode(): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `PN-${ymd}-${uuidv4().slice(0, 4).toUpperCase()}`;
  }

  /** Tạo phiếu DRAFT + items */
  /** Tạo phiếu DRAFT + items */
  async createDraft(userId: string, dto: CreatePurchaseReceiptDto) {
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
    if (!supplier) throw new ResponseCommon(404, false, 'SUPPLIER_NOT_FOUND');

    const ids = dto.items.map(i => i.itemId);
    const invItems = await this.invRepo.find({
      where: { id: In(ids) },
      relations: ['baseUom'],
    });
    if (invItems.length !== ids.length) throw new ResponseCommon(404, false, 'SOME_ITEMS_NOT_FOUND');

    const code = this.buildCode();

    return this.ds.transaction(async (em) => {
      const receiptRepo = em.getRepository(PurchaseReceipt);
      const lineRepo = em.getRepository(PurchaseReceiptItem);
      const uomRepo = em.getRepository(UnitsOfMeasure);
      const convRepo = em.getRepository(UomConversion);

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
      const payloads: DeepPartial<PurchaseReceiptItem>[] = [];

      for (const it of dto.items) {
        const item = invItems.find(x => x.id === it.itemId)!;

        // 1) xác định receivedUom
        const receivedUom = it.receivedUomCode
          ? await uomRepo.findOne({ where: { code: it.receivedUomCode } })
          : item.baseUom;

        if (!receivedUom) throw new ResponseCommon(400, false, 'RECEIVED_UOM_NOT_FOUND');

        // (tuỳ) kiểm tra cùng dimension
        if (
          receivedUom.code !== item.baseUom.code &&
          receivedUom.dimension !== item.baseUom.dimension
        ) {
          throw new ResponseCommon(400, false, 'UOM_DIMENSION_MISMATCH');
        }

        // 2) xác định conversionToBase
        let factor: number;
        if (it.conversionToBase && Number(it.conversionToBase) > 0) {
          factor = Number(it.conversionToBase);
        } else if (receivedUom.code === item.baseUom.code) {
          factor = 1;
        } else {
          const conv = await convRepo.findOne({
            where: { from: { code: receivedUom.code }, to: { code: item.baseUom.code } },
            relations: ['from', 'to'],
          });
          if (!conv) throw new ResponseCommon(400, false, 'NO_CONVERSION_DEFINED');
          factor = Number(conv.factor);
        }

        payloads.push({
          receipt: { id: receipt.id } as any,
          item: { id: item.id } as any,
          lineNo: lineNo++,
          quantity: Number(it.quantity),                         // đảm bảo number
          receivedUom: { code: receivedUom.code } as any,
          conversionToBase: Number(factor),
          unitPrice: Number(it.unitPrice),
          discountType: it.discountType ?? DiscountType.AMOUNT,
          discountValue: Number(it.discountValue ?? 0),
          lotNumber: it.lotNumber ?? undefined,
          expiryDate: it.expiryDate ?? undefined,
          note: it.note ?? undefined,
        });
      }

      const items = lineRepo.create(payloads);
      await lineRepo.save(items);

      // ===== Tính tổng (ép số an toàn) =====
      const subTotal = items.reduce((sum, i) => {
        const qty = Number(i.quantity);
        const price = Number(i.unitPrice);
        const disc = Number(i.discountValue ?? 0);
        // Nếu discount type = PERCENT thì giảm theo %, ngược lại theo số tiền
        const priceAfterItem =
          (i.discountType === DiscountType.PERCENT)
            ? price * (1 - disc / 100)
            : price - disc;
        const lineTotal = Math.max(0, qty * priceAfterItem);
        return sum + lineTotal;
      }, 0);

      const gType = receipt.globalDiscountType;
      const gVal = Number(receipt.globalDiscountValue ?? 0);
      const ship = Number(receipt.shippingFee ?? 0);
      const paid = Number(receipt.amountPaid ?? 0);

      const afterGlobal =
        (gType === DiscountType.PERCENT)
          ? subTotal * (1 - gVal / 100)
          : subTotal - gVal;

      const grandTotal = Math.max(0, +(afterGlobal + ship).toFixed(2));
      const remaining = Math.max(0, +(grandTotal - paid).toFixed(2));

      return {
        id: receipt.id,
        code: receipt.code,
        status: receipt.status,
        supplier: { id: supplier.id, name: supplier.name },
        receiptDate: receipt.receiptDate,
        subTotal: +subTotal.toFixed(2),
        globalDiscount: +(subTotal - afterGlobal).toFixed(2),
        shippingFee: +ship.toFixed(2),
        grandTotal,
        amountPaid: +paid.toFixed(2),
        remaining,
        items: items.map(i => ({
          id: i.id,
          lineNo: i.lineNo!,
          itemId: (i.item as any)?.id ?? i.item,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discountType: i.discountType,
          discountValue: Number(i.discountValue),
          receivedUomCode: (i.receivedUom as any)?.code ?? i.receivedUom,
          conversionToBase: Number(i.conversionToBase),
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
    if (!r) throw new ResponseCommon(404, false, 'RECEIPT_NOT_FOUND');

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
    // 1) Validate header + items
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
    if (!supplier) throw new ResponseCommon(404, false, 'SUPPLIER_NOT_FOUND');

    const ids = dto.items.map(i => i.itemId);
    const invItems = await this.invRepo.find({ where: { id: In(ids) }, relations: ['baseUom'] });
    if (invItems.length !== ids.length) throw new ResponseCommon(404, false, 'SOME_ITEMS_NOT_FOUND');

    if (dto.globalDiscountType === DiscountType.PERCENT && (dto.globalDiscountValue ?? 0) > 100) {
      throw new ResponseCommon(400, false, 'GLOBAL_PERCENT_OUT_OF_RANGE');
    }
    dto.items.forEach((it, idx) => {
      if (it.discountType === DiscountType.PERCENT && (it.discountValue ?? 0) > 100) {
        throw new ResponseCommon(400, false, `LINE_PERCENT_OUT_OF_RANGE_AT_${idx + 1}`);
      }
      if (!it.quantity || it.quantity <= 0) {
        throw new ResponseCommon(400, false, `INVALID_QTY_AT_${idx + 1}`);
      }
      if (it.unitPrice == null || it.unitPrice < 0) {
        throw new ResponseCommon(400, false, `INVALID_PRICE_AT_${idx + 1}`);
      }
    });

    const code = this.buildCode();

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
        const itemMaster = invItems.find(x => x.id === it.itemId)!; // đã validate ở trên

        // === UOM snapshot & conversionToBase (tra từ uom_conversions, có thử đảo chiều) ===
        let receivedUomCode = it.receivedUomCode ?? null;
        let factor = 1;
        let received: UnitsOfMeasure;

        try {
          const res = await resolveUomAndFactor(
            em,
            itemMaster.baseUom.code,            // base (đơn vị nhỏ nhất của item)
            receivedUomCode,                    // FE chọn (CASE24/KG/L/...)
            it.conversionToBase ?? null,        // override nếu FE gửi
          );
          received = res.received;
          factor = res.factor;
          receivedUomCode = received.code;
        } catch (err: any) {
          const msg = String(err?.message || err);
          // Map lỗi helper về ResponseCommon rõ ràng
          if (msg === 'BASE_UOM_NOT_FOUND') throw new ResponseCommon(400, false, `BASE_UOM_NOT_FOUND_AT_${lineNo}`);
          if (msg === 'RECEIVED_UOM_NOT_FOUND') throw new ResponseCommon(400, false, `RECEIVED_UOM_NOT_FOUND_AT_${lineNo}`);
          if (msg === 'UOM_DIMENSION_MISMATCH') throw new ResponseCommon(400, false, `UOM_DIMENSION_MISMATCH_AT_${lineNo}`);
          if (msg === 'NO_CONVERSION_DEFINED') throw new ResponseCommon(400, false, `NO_CONVERSION_DEFINED_AT_${lineNo}`);
          throw new ResponseCommon(400, false, `UOM_ERROR_AT_${lineNo}`);
        }

        // Tạo dòng phiếu: qty theo receivedUom, đóng băng conversionToBase
        const line = lineRepo.create({
          receipt: { id: receipt.id } as any,
          item: { id: itemMaster.id } as any,
          lineNo: lineNo++,
          quantity: it.quantity,                           // theo receivedUom
          receivedUom: { code: receivedUomCode } as any,   // FK tới UnitsOfMeasure(code)
          conversionToBase: factor,                        // 1 received = factor × base
          unitPrice: it.unitPrice,                         // giá theo receivedUom
          discountType: it.discountType ?? DiscountType.AMOUNT,
          discountValue: it.discountValue ?? 0,
          lotNumber: it.lotNumber ?? undefined,
          expiryDate: it.expiryDate ?? undefined,
          note: it.note ?? undefined,
        });
        await lineRepo.save(line);

        // === Cập nhật tồn theo baseUom (đơn vị nhỏ nhất) ===
        const baseQty = Number(line.quantity) * Number(line.conversionToBase);
        // Giữ công thức gốc của bạn: avgCost dựa trên unitPrice/ factor (chưa trừ chiết khấu dòng)
        const unitCostBase = Number(line.unitPrice) / Number(line.conversionToBase);

        const inv = await invRepo.findOne({ where: { id: itemMaster.id } });
        if (!inv) throw new ResponseCommon(404, false, 'ITEM_NOT_FOUND');

        const before = Number(inv.quantity);
        const oldVal = before * Number(inv.avgCost);
        const after = before + baseQty;
        const newAvg = after > 0 ? (oldVal + baseQty * unitCostBase) / after : unitCostBase;

        inv.quantity = Number(after.toFixed(3));
        inv.avgCost = Number(newAvg.toFixed(2));
        await invRepo.save(inv);

        // Giao dịch kho
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
          refItemId: line.id as any,                 // nếu entity có cột này
          note: line.note ?? null,
          performedBy: userId ? ({ id: userId } as any) : null,
        } as DeepPartial<InventoryTransaction>]));

        savedLines.push(line);
      }

      // 4) Tính tổng, snapshot nợ & set STATUS
      const totals = calcReceiptTotals(savedLines as any, receipt);
      const grandTotal = +Number(totals.total).toFixed(2);
      const paidNow = +Number(receipt.amountPaid ?? 0).toFixed(2);

      if (paidNow < 0) throw new ResponseCommon(400, false, 'INVALID_PAYMENT_AMOUNT');
      if (paidNow > grandTotal) throw new ResponseCommon(400, false, 'OVERPAY_NOT_ALLOWED');

      const remaining = Math.max(0, +(grandTotal - paidNow).toFixed(2));
      receipt.debt = remaining;
      receipt.status = remaining === 0 ? ReceiptStatus.PAID : ReceiptStatus.OWING;
      await receiptRepo.save(receipt);

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
      if (!r) throw new ResponseCommon(404, false, 'RECEIPT_NOT_FOUND');

      // Chỉ cho phép thanh toán khi hóa đơn còn nợ
      if (r.status !== ReceiptStatus.POSTED && r.status !== ReceiptStatus.OWING) {
        throw new ResponseCommon(400, false, 'ONLY_OWING_OR_POSTED_CAN_BE_PAID');
      }

      // Tổng tiền hóa đơn
      const totals = calcReceiptTotals(r.items, r);
      const grandTotal = +Number(totals.total).toFixed(2);

      const oldPaid = +Number(r.amountPaid || 0).toFixed(2);
      const add = +Number(dto.addAmountPaid || 0).toFixed(2);

      if (add <= 0) {
        throw new ResponseCommon(400, false, 'INVALID_PAYMENT_AMOUNT');
      }

      const remainingBefore = Math.max(0, +(grandTotal - oldPaid).toFixed(2));

      // Nếu không còn nợ, không cho phép thêm tiền
      if (remainingBefore === 0) {
        throw new ResponseCommon(400, false, 'NO_REMAINING_AMOUNT_TO_PAY');
      }

      // Chặn overpay
      if (add > remainingBefore) {
        throw new ResponseCommon(400, false, 'OVERPAY_NOT_ALLOWED');
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
    if (!r) throw new ResponseCommon(404, false, 'RECEIPT_NOT_FOUND');
    if (r.status !== ReceiptStatus.DRAFT) {
      throw new ResponseCommon(400, false, 'ONLY_DRAFT_CAN_BE_CANCELLED');
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
    if (!existed) throw new ResponseCommon(404, false, 'RECEIPT_NOT_FOUND');

    if (existed.status !== ReceiptStatus.DRAFT && !postNow) {
      // chỉ cho sửa khi còn DRAFT
      throw new ResponseCommon(400, false, 'ONLY_DRAFT_CAN_BE_UPDATED');
    }
    if (existed.status !== ReceiptStatus.DRAFT && postNow) {
      // chỉ cho POST khi đang DRAFT
      throw new ResponseCommon(400, false, 'ONLY_DRAFT_CAN_BE_POSTED');
    }

    // 1) Validate header
    let supplier = existed.supplier;
    if (dto.supplierId && dto.supplierId !== existed.supplier?.id) {
      const foundSupplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
      if (!foundSupplier) throw new ResponseCommon(404, false, 'SUPPLIER_NOT_FOUND');
      supplier = foundSupplier;
      if (!supplier) throw new ResponseCommon(404, false, 'SUPPLIER_NOT_FOUND');
    }

    if (dto.globalDiscountType === DiscountType.PERCENT && (dto.globalDiscountValue ?? 0) > 100) {
      throw new ResponseCommon(400, false, 'GLOBAL_PERCENT_OUT_OF_RANGE');
    }

    // 2) Validate items (nếu client gửi items để thay thế)
    const itemsDto = dto.items ?? [];
    itemsDto.forEach((it, idx) => {
      if (it.discountType === DiscountType.PERCENT && (it.discountValue ?? 0) > 100) {
        throw new ResponseCommon(400, false, `LINE_PERCENT_OUT_OF_RANGE_AT_${idx + 1}`);
      }
      if (!it.quantity || it.quantity <= 0) {
        throw new ResponseCommon(400, false, `INVALID_QTY_AT_${idx + 1}`);
      }
      if (it.unitPrice == null || it.unitPrice < 0) {
        throw new ResponseCommon(400, false, `INVALID_PRICE_AT_${idx + 1}`);
      }
    });

    // 3) Chuẩn bị map InventoryItem (cần baseUom cho conversion)
    const ids = itemsDto.map(i => i.itemId);
    const invItems = ids.length
      ? await this.invRepo.find({ where: { id: In(ids) }, relations: ['baseUom'] })
      : [];
    if (ids.length && invItems.length !== ids.length) {
      throw new ResponseCommon(404, false, 'SOME_ITEMS_NOT_FOUND');
    }

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

      // 4.2 Nếu client gửi mảng items => thay toàn bộ dòng
      let savedLines: PurchaseReceiptItem[] = [];
      if (ids.length) {
        // Xóa hết dòng cũ
        await lineRepo.delete({ receipt: { id: existed.id } as any });

        // Tạo lại dòng mới
        let lineNo = 1;
        for (const it of itemsDto) {
          const itemMaster = invItems.find(x => x.id === it.itemId)!;

          // tra UOM & conversion (có thử chiều nghịch / override)
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
            if (msg === 'BASE_UOM_NOT_FOUND') throw new ResponseCommon(400, false, `BASE_UOM_NOT_FOUND_AT_${lineNo}`);
            if (msg === 'RECEIVED_UOM_NOT_FOUND') throw new ResponseCommon(400, false, `RECEIVED_UOM_NOT_FOUND_AT_${lineNo}`);
            if (msg === 'UOM_DIMENSION_MISMATCH') throw new ResponseCommon(400, false, `UOM_DIMENSION_MISMATCH_AT_${lineNo}`);
            if (msg === 'NO_CONVERSION_DEFINED') throw new ResponseCommon(400, false, `NO_CONVERSION_DEFINED_AT_${lineNo}`);
            throw new ResponseCommon(400, false, `UOM_ERROR_AT_${lineNo}`);
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
          savedLines.push(line);
        }
      } else {
        // không gửi items => lấy lại các dòng hiện có
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
          items: (await lineRepo.find({ where: { receipt: { id: existed.id } as any }, relations: ['item', 'receivedUom'], order: { lineNo: 'ASC' } }))
            .map(i => ({
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
      }

      // 4.4 Nếu POST NOW: áp dụng kho + transactions
      // Re-load lines (đảm bảo có hết dữ liệu)
      const linesToPost = await lineRepo.find({
        where: { receipt: { id: existed.id } as any },
        relations: ['item'],
        order: { lineNo: 'ASC' },
      });

      for (const line of linesToPost) {
        const itemId = (line.item as any)?.id ?? line.item;
        const inv = await invRepo.findOne({ where: { id: itemId } });
        if (!inv) throw new ResponseCommon(404, false, 'ITEM_NOT_FOUND');

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

      if (paidNow < 0) throw new ResponseCommon(400, false, 'INVALID_PAYMENT_AMOUNT');
      if (paidNow > grandTotal) throw new ResponseCommon(400, false, 'OVERPAY_NOT_ALLOWED');

      const remaining = Math.max(0, +(grandTotal - paidNow).toFixed(2));
      existed.debt = remaining;
      existed.status = remaining === 0 ? ReceiptStatus.PAID : ReceiptStatus.OWING;
      await receiptRepo.save(existed);

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
