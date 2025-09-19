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
import { calcLineTotal, calcReceiptTotals } from '@modules/helper/purchasereceipt.service';
import { PayReceiptDto } from './dto/pay-receipt.dto';
import { InventoryTransaction } from '@modules/inventorytransaction/entities/inventorytransaction.entity';
@Injectable()
export class PurchasereceiptService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(PurchaseReceipt) private readonly receiptRepo: Repository<PurchaseReceipt>,
    @InjectRepository(PurchaseReceiptItem) private readonly itemRepo: Repository<PurchaseReceiptItem>,
    @InjectRepository(InventoryItem) private readonly invRepo: Repository<InventoryItem>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
  ) { }

  /** PN-yyyymmdd-XXXX */
  private buildCode(): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `PN-${ymd}-${uuidv4().slice(0, 4).toUpperCase()}`;
  }

  /** Tạo phiếu DRAFT + items */
  async createDraft(userId: string, dto: CreatePurchaseReceiptDto) {
    console.log('userId, dto', userId, dto);
    // 2) tra supplier, items như bạn đã làm...
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId } });
    if (!supplier) throw new ResponseCommon(404, false, 'SUPPLIER_NOT_FOUND');

    const ids = dto.items.map(i => i.itemId);
    const invItems = await this.invRepo.find({ where: { id: In(ids) } });
    if (invItems.length !== ids.length) throw new ResponseCommon(404, false, 'SOME_ITEMS_NOT_FOUND');

    const code = this.buildCode();
    // 3) Tạo receipt + items trong transaction để đảm bảo tính toàn vẹn dữ liệu 
    return this.ds.transaction(async (em) => {
      const receipt = em.create(PurchaseReceipt, {
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
      await em.save(receipt);
      // Tạo items và gán vào receipt vừa tạo ở trên
      const items = dto.items.map((it) =>
        em.create(PurchaseReceiptItem, {
          receipt,
          item: invItems.find(x => x.id === it.itemId)!,
          quantity: it.quantity,
          receivedUnit: it.receivedUnit ?? null,
          conversionToBase: it.conversionToBase ?? 1,
          unitPrice: it.unitPrice,
          discountType: it.discountType ?? DiscountType.AMOUNT,
          discountValue: it.discountValue ?? 0,
          lotNumber: it.lotNumber ?? null,
          expiryDate: it.expiryDate ?? null,
          note: it.note ?? null,
        } as DeepPartial<PurchaseReceiptItem>)
      );
      await em.save(items);
      // load lại items vào receipt.items
      return {
        id: receipt.id,
        code: receipt.code,
        status: receipt.status,
        supplier: { id: supplier.id, name: supplier.name },
        receiptDate: receipt.receiptDate,
        items: items.map(i => ({
          id: i.id,
          itemId: i.item.id,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discountType: i.discountType,
          discountValue: Number(i.discountValue),
          receivedUnit: i.receivedUnit,
          conversionToBase: Number(i.conversionToBase),
        })),
      };
    });
  }

  // this function is used to get detail of a receipt by id
  async getDetail(id: string) {
    const r = await this.receiptRepo.findOne({
      where: { id },
      relations: ['supplier', 'items', 'items.item'],
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
      items: r.items.map(i => ({
        id: i.id,
        itemId: i.item.id,
        itemName: i.item.name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discountType: i.discountType,
        discountValue: Number(i.discountValue),
        receivedUnit: i.receivedUnit,
        conversionToBase: Number(i.conversionToBase),
        lotNumber: i.lotNumber,
        expiryDate: i.expiryDate,
        lineTotal: calcLineTotal(i),
      })),
    };
  }

  // this endpoint is used to get list of receipts with pagination
  async getList(page: number = 1, limit: number = 10): Promise<any> {
    const [receipts, total] = await this.receiptRepo.findAndCount({
      relations: ['supplier', 'items'],
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
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async postReceipt(id: string) {
    return this.ds.transaction(async (em) => {
      const r = await em.getRepository(PurchaseReceipt).findOne({
        where: { id },
        relations: ['items', 'items.item', 'supplier', 'createdBy'],
      });
      if (!r) throw new ResponseCommon(404, false, 'RECEIPT_NOT_FOUND');
      if (r.status !== ReceiptStatus.DRAFT) throw new ResponseCommon(400, false, 'RECEIPT_NOT_IN_DRAFT_STATUS');
      if (!r.items?.length) throw new ResponseCommon(400, false, 'RECEIPT_HAS_NO_ITEMS');

      // Cập nhật tồn + avgCost theo từng dòng
      for (const li of r.items) {
        const baseQty = Number(li.quantity) * Number(li.conversionToBase || 1);
        if (baseQty <= 0) throw new ResponseCommon(400, false, 'INVALID_ITEM_QUANTITY');

        const item = li.item;
        const lineValue = calcLineTotal(li); // sau discount item
        const inUnitCost = lineValue / baseQty;

        const oldQty = Number(item.quantity);
        const oldAvg = Number(item.avgCost);
        const newQty = oldQty + baseQty;
        const newAvg = newQty > 0 ? ((oldQty * oldAvg) + lineValue) / newQty : oldAvg;

        item.quantity = +newQty.toFixed(3);
        item.avgCost = +newAvg.toFixed(2);
        await em.save(item);

        // Lưu giao dịch vào bảng InventoryTransaction
        const invTransaction = new InventoryTransaction();
        invTransaction.item = item;
        invTransaction.quantity = +baseQty.toFixed(3);
        invTransaction.action = InventoryAction.IN; // Hành động nhập kho
        invTransaction.unitCost = +inUnitCost.toFixed(2);
        invTransaction.lineCost = +lineValue.toFixed(2);
        invTransaction.beforeQty = oldQty;
        invTransaction.afterQty = newQty;
        invTransaction.refType = 'PurchaseReceipt';
        invTransaction.refId = r.id;
        invTransaction.refItemId = li.id;
        invTransaction.note = `Nhập từ phiếu ${r.code}`;
        invTransaction.performedBy = r.createdBy;

        await em.save(invTransaction);
      }

      r.status = ReceiptStatus.POSTED;
      await em.save(r);
      return { id: r.id, status: r.status };
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

      // chỉ cho pay khi đã POSTED hoặc đã một phần trả (PAID vẫn cho trả 0 nếu cần idempotent)
      if (r.status !== ReceiptStatus.POSTED && r.status !== ReceiptStatus.PAID) {
        throw new ResponseCommon(400, false, 'ONLY_POSTED_CAN_BE_PAID');
      }

      // tổng tiền hóa đơn
      const totals = calcReceiptTotals(r.items, r);
      const grandTotal = +Number(totals.total).toFixed(2);

      const oldPaid = +Number(r.amountPaid || 0).toFixed(2);
      const add = +Number(dto.addAmountPaid || 0).toFixed(2);

      if (add <= 0) {
        throw new ResponseCommon(400, false, 'INVALID_PAYMENT_AMOUNT');
      }

      const remainingBefore = Math.max(0, +(grandTotal - oldPaid).toFixed(2));

      // chặn overpay
      if (add > remainingBefore) {
        throw new ResponseCommon(400, false, 'OVERPAY_NOT_ALLOWED');
      }

      const newPaid = +(oldPaid + add).toFixed(2);
      r.amountPaid = newPaid;

      const remaining = Math.max(0, +(grandTotal - newPaid).toFixed(2));
      const paidInFull = remaining === 0;

      if (paidInFull) {
        r.status = ReceiptStatus.PAID;
      } else if (r.status !== ReceiptStatus.POSTED) {
        // nếu trước đó là PAID mà giờ còn nợ (hiếm, khi giảm tổng tiền/rollback), đảm bảo về POSTED
        r.status = ReceiptStatus.POSTED;
      }

      await em.save(r);

      return {
        id: r.id,
        status: r.status,        // PAID => hết nợ; POSTED => còn nợ
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
}
