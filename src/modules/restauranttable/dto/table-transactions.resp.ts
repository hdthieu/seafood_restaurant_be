// dto/table-transactions.resp.ts
export type TableTransactionRow = {
  invoiceId: string;
  invoiceNumber: string;
  createdAt: string;   // ISO
  totalAmount: string; // numeric as string
  status: string;
  cashier:   { id: string | null; name: string | null };
  orderedBy: { id: string | null; name: string | null };
};

export type TableTransactionsResp = {
  items: TableTransactionRow[];
  meta: { total: number; page: number; limit: number; pages: number };
};
