import { Injectable } from '@nestjs/common';
import { CreatePurchaseReceiptDto } from './dto/create-purchasereceipt.dto';
import { PurchaseReceipt } from './entities/purchasereceipt.entity';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';
import { DataSource, DeepPartial, Repository } from 'typeorm';
import { InventoryItem } from '@modules/inventoryitems/entities/inventoryitem.entity';
import { Supplier } from '@modules/supplier/entities/supplier.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DiscountType, ReceiptStatus } from 'src/common/enums';
import { v4 as uuidv4 } from 'uuid';
import { In } from 'typeorm';
import { calcLineTotal, calcReceiptTotals } from '@modules/helper/purchasereceipt.service';
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
}
