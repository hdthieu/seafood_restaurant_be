import { DiscountType } from 'src/common/enums';
import { PurchaseReceipt } from '@modules/purchasereceipt/entities/purchasereceipt.entity';
import { PurchaseReceiptItem } from '@modules/purchasereceiptitem/entities/purchasereceiptitem.entity';

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

