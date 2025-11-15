import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { LlmGateway } from "./llm.gateway";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export type GetSalesSummaryArgs = { from: string; to: string; by?: "hour" | "day" };

const DEFAULT_MAX_LIMIT = Number(process.env.SMARTSQL_MAX_LIMIT || 200);
const TZ_DEFAULT = process.env.TZ || "Asia/Ho_Chi_Minh";

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  private readonly ALLOW_ALL_TABLES =
    String(process.env.ALLOW_ALL_TABLES || "false").toLowerCase() === "true";

  private readonly SCHEMA_ALLOWLIST = new Set<string>(
    (process.env.TABLE_SCHEMAS || "public").split(",").map((s) => s.trim()).filter(Boolean),
  );

  private readonly EXTRA_SCHEMA_FILES = (process.env.SMARTSQL_SCHEMA_FILES || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  private TABLE_ALLOWLIST = new Set<string>();
  private TABLE_ALLOWLIST_FQN = new Set<string>();

  private schemaContext = "";
  private schemaLoadedAt = 0;

  constructor(private readonly ds: DataSource, private readonly llm: LlmGateway) {}

  async onModuleInit() {
    await this.refreshTableAllowlist();
    await this.refreshSchemaContext();
  }

  /* === PUBLIC: matcher cho AiService === */
  public isDataQuestion(q: string): boolean {
    return /(bao\s*nhiêu|mấy|số\s*lượng|tổng|đếm|count|best.?selling|bán.*chạy|phổ\s*biến)/i.test(q)
      || /(món|món ăn|bàn|khách hàng|hóa đơn|đơn hàng|payments?|nhân\s*viên|ingredient|nguyên\s*liệu|menu\s*items?)/i.test(q)
      || /(doanh\s*thu|revenue|hôm nay|hôm qua|7\s*ngày|theo\s*giờ|theo\s*ngày)/i.test(q);
  }

  async getSalesSummary(args: GetSalesSummaryArgs) {
    const by = args.by ?? "hour";
    const bucket = by === "hour" ? "date_trunc('hour', i.created_at)" : "date_trunc('day', i.created_at)";
   const series = await this.ds.query(
  `
  SELECT ${bucket} AS bucket,
         COUNT(*) AS invoices,
         COALESCE(SUM(COALESCE(i.final_amount, i.total_amount)), 0) AS gross_amount,
         COALESCE(SUM(i.discount_total), 0) AS discount_amount,
         COALESCE(SUM(COALESCE(i.final_amount, i.total_amount) - i.discount_total), 0) AS net_amount
  FROM invoices i
  WHERE ${bucket} BETWEEN $1 AND $2
    AND i.status IN ('PAID','UNPAID','PARTIAL')
  GROUP BY 1
  ORDER BY 1 ASC
  `,
  [args.from, args.to],
);

    const kpi = await this.ds.query(
      `
      SELECT COUNT(*) AS invoices,
             COALESCE(SUM(COALESCE(i.final_amount, i.total_amount)), 0) AS gross_amount,
             COALESCE(SUM(i.discount_total), 0) AS discount_amount,
             COALESCE(SUM(COALESCE(i.final_amount, i.total_amount) - i.discount_total), 0) AS net_amount,
             COALESCE(AVG((COALESCE(i.final_amount, i.total_amount) - i.discount_total)::numeric), 0) AS avg_ticket
      FROM invoices i
      WHERE i.created_at BETWEEN $1 AND $2
        AND i.status IN ('PAID','UNPAID','PARTIAL')
      `,
      [args.from, args.to],
    );
    return { by, series, kpi: kpi?.[0] ?? {} };
  }
// src/modules/ai/tools.service.ts
private matchTemplate(question: string): string | null {
  const q = question.toLowerCase();

  // Top món bán chạy 7 ngày
  if (/(top|5|five).*(bán\s*chạy|best.?selling|phổ\s*biến)/i.test(q)) {
    // Chọn join theo schema bạn đang dùng; đây là biến thể join invoices qua order_id
    return `
      SELECT mi.name                           AS item_name,
             COALESCE(SUM(oi.quantity), 0)     AS qty_sold,
             COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
      FROM order_items oi
      JOIN menu_items mi ON mi.id = oi."menuItemId"
      JOIN invoices i    ON i.order_id = oi."orderId"
      WHERE i.status IN ('PAID','UNPAID','PARTIAL')
        AND i.created_at >= NOW() - INTERVAL '7 days'
        AND oi.deleted_at IS NULL
        AND oi.cancelled_at IS NULL
      GROUP BY mi.name
      ORDER BY qty_sold DESC, revenue DESC
      LIMIT 5
    `;
  }

  // Đếm số món
  if (/(bao nhiêu|mấy|count).*(món|menu)/i.test(q)) {
    return `SELECT COUNT(*)::int AS total_items FROM menu_items`;
  }

  return null;
}


 async runSmartQuery(question: string) {
  await this.ensureSchemaFresh(5 * 60_000);

  // 1) Ưu tiên template
  let sql = this.matchTemplate(question);

  // 2) Nếu chưa có template → nhờ LLM sinh
  if (!sql) {
    try {
      const raw = await this.generateSql(question, this.schemaContext, { timezone: TZ_DEFAULT });
      sql = this.sanitize(this.extractSQL(raw));
    } catch (e) {
      // 3) LLM lỗi → thử template lại lần cuối; nếu không có, ném lỗi để AiService hiển thị hướng dẫn
      sql = this.matchTemplate(question);
      if (!sql) throw e;
    }
  }

  const rows = await this.ds.query(sql);

  // Natural language – nếu LLM diễn giải lỗi thì vẫn trả rows
  let explain = "";
try {
  const sys = `
  Bạn là trợ lý nhà hàng thông minh. 
  Nhiệm vụ: diễn giải **kết quả truy vấn dữ liệu** một cách tự nhiên, thân thiện và dễ hiểu cho người quản lý nhà hàng.
  - Nếu kết quả là số lượng (count), hãy trả lời bằng câu tự nhiên, ví dụ: 
    "Hiện tại nhà hàng có 12 món trong thực đơn." hoặc "Có tổng cộng 85 đơn hàng trong tuần này."
  - Nếu là doanh thu hoặc tổng tiền, hãy thêm đơn vị "VNĐ" hoặc "đồng".
  - Nếu là danh sách món ăn, khách hàng, hoặc hóa đơn, hãy tóm tắt vài dòng đầu, không cần in nguyên bảng.
  - Nếu dữ liệu trống, hãy nói lịch sự rằng "Hiện chưa có dữ liệu cho truy vấn này."
  - Tránh dùng ký hiệu SQL hay từ ngữ kỹ thuật (SELECT, COUNT,...). 
  - Trả lời bằng tiếng Việt, giọng tự nhiên, thân thiện, có thể dùng emoji nhẹ nhàng.`;

  const sample = Array.isArray(rows) ? rows.slice(0, 3) : rows;
  const user = `Câu hỏi người dùng: ${question}\n\nSQL đã chạy:\n${sql}\n\nKết quả mẫu:\n${JSON.stringify(sample, null, 2)}\n`;

  explain = await this.llm.chat(sys, user, 18000);
} catch (e) {
  const count = Array.isArray(rows) ? rows.length : 0;
  explain = count > 0
    ? `✅ Đã truy vấn xong (${count} dòng).`
    : `Không có dữ liệu phù hợp với câu hỏi "${question}".`;
}



  return { sql, rows, explain, sources: [{ type: "db", note: "Smart-SQL" }] };
}



  // ===== helpers để build schema/sanitize (giữ nguyên như bản trước) =====
  private async refreshTableAllowlist() {
    const rows = await this.ds.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog','information_schema')
    `);
    const names = new Set<string>(), fqns = new Set<string>();
    for (const r of rows) {
      const schema = String(r.table_schema);
      const name = String(r.table_name);
      if (!this.SCHEMA_ALLOWLIST.has(schema)) continue;
      names.add(name);
      fqns.add(`${schema}.${name}`);
    }
    this.TABLE_ALLOWLIST = names;
    this.TABLE_ALLOWLIST_FQN = fqns;
    this.logger.log(`Table allowlist: ${names.size} tables from [${[...this.SCHEMA_ALLOWLIST].join(", ")}]`);
  }

  private async refreshSchemaContext() {
    const cols = await this.ds.query(
      `
      SELECT c.table_schema, c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE t.table_type = 'BASE TABLE'
        AND c.table_schema = ANY($1)
      ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `,
      [[...this.SCHEMA_ALLOWLIST]],
    );

    const perTable: Record<string, Array<{ column_name: string; data_type: string }>> = {};
    for (const r of cols) {
      const key = `${r.table_schema}.${r.table_name}`;
      if (!perTable[key]) perTable[key] = [];
      perTable[key].push({ column_name: r.column_name, data_type: r.data_type });
    }

    const lines: string[] = ["# DB Schema (short)"];
    for (const [fqn, arr] of Object.entries(perTable)) {
      lines.push(`\n## ${fqn}`);
      const colsLine = arr.slice(0, 48).map((c) => `- ${c.column_name} (${c.data_type})`).join("\n");
      lines.push(colsLine || "- (no columns?)");
      if (arr.length > 48) lines.push(`- ... (${arr.length - 48} more)`);
    }

    for (const f of this.EXTRA_SCHEMA_FILES) {
      try {
        const abs = path.resolve(f);
        const text = await fs.readFile(abs, "utf8");
        lines.push(`\n# EXTRA: ${path.basename(abs)}\n`);
        lines.push(text.slice(0, 20000));
      } catch {}
    }

    this.schemaContext = lines.join("\n");
    this.schemaLoadedAt = Date.now();
    this.logger.log(`Schema context built (${this.schemaContext.length} chars)`);
  }

  private async ensureSchemaFresh(ttlMs: number) {
    if (!this.schemaLoadedAt || Date.now() - this.schemaLoadedAt > ttlMs) {
      await this.refreshSchemaContext();
    }
  }

  private async generateSql(question: string, context: string, opts?: { timezone?: string }) {
    const tz = opts?.timezone || TZ_DEFAULT;
    const sys =
      `Bạn là trợ lý PostgreSQL. NHIỆM VỤ: Sinh DUY NHẤT 1 câu SELECT (không CTE, không ; cuối).` +
      ` Chỉ đọc dữ liệu: CẤM UPDATE/DELETE/INSERT/ALTER/DROP/TRUNCATE.` +
      ` Nếu có lọc thời gian mà thiếu mốc, mặc định là HÔM NAY theo múi giờ ${tz}.` +
      ` Nếu dự kiến trả quá nhiều dòng, thêm LIMIT ${DEFAULT_MAX_LIMIT} (trừ khi dùng COUNT/AGG).` +
      ` Chỉ trả về đúng 1 code block \`\`\`sql ... \`\`\`.`;
    const user =
      `Câu hỏi: ${question}\n\nSchema (rút gọn):\n${context}\n\n` +
      `Yêu cầu:\n- Dùng đúng tên bảng/cột theo schema trên.\n- KHÔNG thêm text ngoài code block.\n`;
    const out = await this.llm.chat(sys, user, 25000);
    if (!out) throw new Error("LLM did not return any SQL.");
    return out;
  }

  private extractSQL(text: string): string {
    if (!text) throw new Error("LLM không trả về gì.");
    const fence = text.match(/```sql([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
    if (fence?.[1]) return fence[1].trim();
    const idx = text.toLowerCase().indexOf("select ");
    if (idx >= 0) return text.slice(idx).replace(/[\u0000-\u001F]+/g, " ").trim();
    throw new Error("Không tìm thấy câu SELECT trong phản hồi LLM.");
  }

  private sanitize(sqlInput: string): string {
    let sql = sqlInput.trim().replace(/;+\s*$/g, "");
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
        raw = raw.split(/\s+/)[0];
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
    if (!hasLimit && !isAgg) sql = `${sql} LIMIT ${DEFAULT_MAX_LIMIT}`;
    return sql;
  }
}
