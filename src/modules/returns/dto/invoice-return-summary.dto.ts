export class InvoiceReturnSummaryDto {
  invoiceId: string;
  invoiceNumber: string;
  createdAt: string;
  customerName?: string | null;
  tableName?: string | null;
  totalAmount: number;
  finalAmount: number;

  items: Array<{
    orderItemId: string;
    menuItemId: string;
    name: string;
    unitPrice: number;
    soldQty: number;
    returnedQty: number;
    remainQty: number;
  }>;
}
