// src/modules/ai/tools.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { ollamaChat } from "../../lib/ollma";

export type GetSalesSummaryArgs = {
  from: string; // ISO
  to: string;   // ISO
  by?: "hour" | "day";
};

type ExplainOpt = { sql?: string };

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  /** Cho phép bỏ kiểm duyệt bảng (dev only) */
  private readonly ALLOW_ALL_TABLES =
    String(process.env.ALLOW_ALL_TABLES || "false").toLowerCase() === "true";

  /** Danh sách schema cho phép */
  private readonly SCHEMA_ALLOWLIST = new Set<string>(
    (process.env.TABLE_SCHEMAS || "public,test")
      .split(",").map((s) => s.trim()).filter(Boolean)
  );

  private TABLE_ALLOWLIST = new Set<string>();     // tên ngắn
  private TABLE_ALLOWLIST_FQN = new Set<string>(); // schema.table

  constructor(private readonly ds: DataSource) {}

  async onModuleInit() {
    await this.refreshTableAllowlist();
  }

  async refreshTableAllowlist() {
    const rows = await this.ds.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog','information_schema')`);
    const names = new Set<string>();
    const fqns  = new Set<string>();

    for (const r of rows) {
      const schema = String(r.table_schema);
      const name   = String(r.table_name);
      if (!this.SCHEMA_ALLOWLIST.has(schema)) continue;
      names.add(name);
      fqns.add(`${schema}.${name}`);
    }
    this.TABLE_ALLOWLIST = names;
    this.TABLE_ALLOWLIST_FQN = fqns;

    this.logger.log(`Table allowlist loaded: ${names.size} tables from [${[...this.SCHEMA_ALLOWLIST].join(", ")}]`);
  }

  /** ========== Sales summary ========== */
  async getSalesSummary(args: GetSalesSummaryArgs) {
    const by = args.by ?? "hour";
    const bucketExpr = by === "hour"
      ? "date_trunc('hour', i.created_at)"
      : "date_trunc('day',  i.created_at)";

    const series = await this.ds.query(
      `
      SELECT
        ${bucketExpr} AS bucket,
        COUNT(*) AS invoices,
        COALESCE(SUM(COALESCE(i.final_amount, i.total_amount)), 0)                    AS gross_amount,
        COALESCE(SUM(i.discount_total), 0)                                            AS discount_amount,
        COALESCE(SUM(COALESCE(i.final_amount, i.total_amount) - i.discount_total), 0) AS net_amount
      FROM invoices i
      WHERE ${bucketExpr} BETWEEN $1 AND $2
        AND i.status IN ('PAID','UNPAID','PARTIAL')
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      [args.from, args.to]
    );

    const kpi = await this.ds.query(
      `
      SELECT
        COUNT(*) AS invoices,
        COALESCE(SUM(COALESCE(i.final_amount, i.total_amount)), 0)                    AS gross_amount,
        COALESCE(SUM(i.discount_total), 0)                                            AS discount_amount,
        COALESCE(SUM(COALESCE(i.final_amount, i.total_amount) - i.discount_total), 0) AS net_amount,
        COALESCE(AVG((COALESCE(i.final_amount, i.total_amount) - i.discount_total)::numeric), 0) AS avg_ticket
      FROM invoices i
      WHERE i.created_at BETWEEN $1 AND $2
        AND i.status IN ('PAID','UNPAID','PARTIAL')
      `,
      [args.from, args.to]
    );

    return {
      by,
      series,
      kpi: kpi?.[0] ?? {
        invoices: 0, gross_amount: 0, discount_amount: 0, net_amount: 0, avg_ticket: 0,
      },
    };
  }

  /** ========== Smart SQL (LLM -> SELECT an toàn) ========== */
  private extractSQL(text: string): string {
    if (!text) throw new Error("LLM không trả về SQL");
    const fence = text.match(/```sql([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
    if (fence?.[1]) return fence[1].trim();
    const idx = text.toLowerCase().indexOf("select ");
    if (idx >= 0) return text.slice(idx).replace(/[\u0000-\u001F]+/g, " ").trim();
    throw new Error("Không thấy câu SELECT trong phản hồi.");
  }

  private sanitize(sqlInput: string): string {
    const sql = sqlInput.trim().replace(/;+\s*$/g, "");
    const lower = sql.toLowerCase();

    if (!lower.startsWith("select")) throw new Error("Chỉ cho phép SELECT.");
    for (const bad of [" update ", " delete ", " insert ", " alter ", " drop ", " truncate ", " create "]) {
      if (lower.includes(bad)) throw new Error(`Câu SQL chứa từ khóa cấm: ${bad.trim()}`);
    }
    if (sql.includes(";")) throw new Error("Chỉ cho phép 1 câu lệnh duy nhất.");

    if (!this.ALLOW_ALL_TABLES) {
      const tableMatches = [...lower.matchAll(/\b(from|join)\s+([a-z0-9_."']+)/g)];
      for (const m of tableMatches) {
        let raw = m[2].replace(/["']/g, "");
        raw = raw.split(/\s+/)[0]; // bỏ alias

        if (raw.includes(".")) {
          if (!this.TABLE_ALLOWLIST_FQN.has(raw)) {
            const tbl = raw.split(".").pop()!;
            if (!this.TABLE_ALLOWLIST.has(tbl))
              throw new Error(`Bảng không nằm trong danh sách cho phép: ${raw}`);
          }
        } else {
          if (!this.TABLE_ALLOWLIST.has(raw))
            throw new Error(`Bảng không nằm trong danh sách cho phép: ${raw}`);
        }
      }
    }

    const hasLimit = /\blimit\s+\d+/i.test(sql);
    const isAgg =
      /\bcount\s*\(/i.test(sql) ||
      /\bgroup\s+by\b/i.test(sql) ||
      /\bsum\s*\(/i.test(sql) ||
      /\bavg\s*\(/i.test(sql) ||
      /\bmin\s*\(/i.test(sql) ||
      /\bmax\s*\(/i.test(sql);

    if (!hasLimit && !isAgg) return `${sql} LIMIT 200`;
    return sql;
  }

  private async explain(question: string, rows: any[], opt: ExplainOpt = {}) {
    const sys = `Bạn là trợ lý phân tích. Viết 3–5 câu, gọn và đúng số. Định dạng tiền kiểu 1.234.000 đ.`;
    const usr = `Câu hỏi: ${question}\n${opt.sql ? `SQL: ${opt.sql}\n` : ""}Kết quả (<=100 dòng):\n${JSON.stringify(rows?.slice?.(0, 100) ?? rows)}`;
    return ollamaChat(
      [{ role: "system", content: sys }, { role: "user", content: usr }],
      process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b"
    );
  }

  /** E2E: sinh & chạy SELECT an toàn từ câu hỏi tự nhiên */
  async runSmartQuery(question: string) {
    // 1) Prompt sinh SQL
    const genSystem = `
Bạn là trợ lý PostgreSQL. Sinh đúng 1 câu lệnh **SELECT** (không CTE, không ; ở cuối).
Chỉ đọc dữ liệu (CẤM UPDATE/DELETE/INSERT/ALTER/DROP/TRUNCATE).
Tập bảng cho phép: ${[...this.TABLE_ALLOWLIST].join(", ")}.
Nếu thiếu thời gian, ưu tiên cột created_at và mặc định hôm nay (Asia/Ho_Chi_Minh).
Chỉ trả về **một** code block \`\`\`sql ... \`\`\`.
`.trim();

    const genUser = `
Câu hỏi: ${question}
Yêu cầu:
- Dùng tên bảng/cột đúng schema (invoices, orders, order_items, payments, customers, tables, users, ...).
- Nếu có thể trả về quá nhiều dòng, thêm LIMIT 200 (trừ COUNT/AGG).
`.trim();

    const raw = await ollamaChat(
      [{ role: "system", content: genSystem }, { role: "user", content: genUser }],
      process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b"
    );

    const sql = this.sanitize(this.extractSQL(raw));
    const rows = await this.ds.query(sql);
    const explain = await this.explain(question, rows, { sql });

    return { sql, rows, explain };
  }
}
