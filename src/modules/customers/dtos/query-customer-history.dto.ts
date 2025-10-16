// src/modules/invoice/dto/customer-invoice.dto.ts
export type CustomerInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  time: string; // ISO
  totalAmount: string; // numeric string
  status: string;
  orderedBy: { id: string | null; name: string | null }; // người tạo order
};

export type CustomerInvoiceListResp = {
  items: CustomerInvoiceRow[];
};

