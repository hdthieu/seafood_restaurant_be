import { DiscountType } from 'src/common/enums';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity';
import { EntityManager } from 'typeorm';
import { ResponseCommon } from 'src/common/common_dto/respone.dto';

export function calcLineTotal(it: PurchaseReceiptItem): number {
    const unit = Number(it.unitPrice);
    const qty = Number(it.quantity);
    const disc = Number(it.discountValue || 0);

    const lineBefore = unit * qty;
    const lineDiscount =
        it.discountType === DiscountType.PERCENT
            ? lineBefore * (disc / 100)
            : disc;
    const line = lineBefore - lineDiscount;
    return Math.max(0, +line.toFixed(2));
}


export function calcReceiptTotals(items: PurchaseReceiptItem[], r: PurchaseReceipt) {
    const subTotal = items.reduce((s, it) => s + calcLineTotal(it), 0);
    const gVal = Number(r.globalDiscountValue || 0);
    const afterGlobal =
        r.globalDiscountType === DiscountType.PERCENT
            ? subTotal * (1 - gVal / 100)
            : subTotal - gVal;

    const total = Math.max(0, +(afterGlobal + Number(r.shippingFee || 0)).toFixed(2));
    return { subTotal: +subTotal.toFixed(2), total };
}

export async function resolveUomAndFactor(
    em: EntityManager,
    baseUomCode: string,                    // UOM gốc của item (đơn vị nhỏ nhất)
    receivedUomCode?: string | null,        // FE chọn để nhập (vd: CASE24, KG, ...)
    overrideFactor?: number | null,         // FE override (nếu có)
) {
    const uomRepo = em.getRepository(UnitsOfMeasure);
    const convRepo = em.getRepository(UomConversion);

    // 1) lấy entity UOM
    const base = await uomRepo.findOne({ where: { code: baseUomCode } });
    if (!base) throw new ResponseCommon(400, false, 'BASE_UOM_NOT_FOUND');

    const received =
        receivedUomCode
            ? await uomRepo.findOne({ where: { code: receivedUomCode } })
            : base;

    if (!received) throw new ResponseCommon(400, false, 'RECEIVED_UOM_NOT_FOUND');

    // 2) nếu FE override => dùng luôn
    if (overrideFactor && overrideFactor > 0) {
        return { received, factor: Number(overrideFactor) };
    }

    // 3) nếu cùng UOM => factor = 1
    if (received.code === base.code) {
        return { received, factor: 1 };
    }

    // 4) kiểm tra dimension
    if (received.dimension !== base.dimension) {
        // nếu muốn cho phép khác dimension thì bỏ check này
        throw new ResponseCommon(400, false, 'UOM_DIMENSION_MISMATCH');
    }

    // 5) tra conversion: from(received) -> to(base)
    let conv = await convRepo.findOne({
        where: { from: { code: received.code }, to: { code: base.code } },
        relations: ['from', 'to'],
    });
    if (conv) return { received, factor: Number(conv.factor) };

    // 6) thử chiều nghịch rồi đảo ngược: from(base) -> to(received)
    conv = await convRepo.findOne({
        where: { from: { code: base.code }, to: { code: received.code } },
        relations: ['from', 'to'],
    });
    if (conv && Number(conv.factor) !== 0) {
        return { received, factor: 1 / Number(conv.factor) };
    }

    // 7) không có conversion nào
    throw new ResponseCommon(400, false, 'UOM_CONVERSION_NOT_FOUND');
}
