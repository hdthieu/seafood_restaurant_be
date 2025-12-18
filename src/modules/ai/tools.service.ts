import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { LlmGateway } from "./llm.gateway";

const DEFAULT_MAX_LIMIT = Number(process.env.SMARTSQL_MAX_LIMIT || 200);
const TZ_DEFAULT = process.env.TZ || "Asia/Ho_Chi_Minh";

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  /** enum_name -> (lower_label -> real_label) */
  private ENUM_LABEL_MAP = new Map<string, Map<string, string>>();

  /**
   * Map cột -> enum type (theo bảng):
   * key: schema.table
   * value: Map<columnName, enum_name>
   */
  private TABLE_COLUMN_ENUM_TYPE = new Map<string, Map<string, string>>();

  /**
   * Map theo bảng:
   * key: schema.table
   * value: Map<normalizedColumn, realColumn>
   */
  private COLUMN_NAME_MAP_BY_TABLE = new Map<string, Map<string, string>>();

  private schemaContext = "";
  private schemaLoadedAt = 0;

  private readonly SCHEMA_ALLOWLIST = new Set<string>(
    (process.env.TABLE_SCHEMAS || "public")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  constructor(
    private readonly ds: DataSource,
    private readonly llm: LlmGateway,
  ) {}

  async onModuleInit() {
    await this.refreshSchemaContext();
  }

  // ======================================================
  // MAIN
  // ======================================================
  async runSmartQuery(question: string) {
    await this.ensureSchemaFresh(5 * 60_000);

    const raw = await this.generateSql(question, this.schemaContext, {
      timezone: TZ_DEFAULT,
    });

    let sql = this.extractSQL(raw);
    sql = this.sanitize(sql);

    const rows = await this.ds.query(sql);

    let explain = "";
    try {
      explain = await this.llm.chat(
        "Bạn là trợ lý nhà hàng thông minh. Trả lời tiếng Việt, dễ hiểu.",
        `
Câu hỏi: ${question}

SQL:
${sql}

Kết quả mẫu:
${JSON.stringify(Array.isArray(rows) ? rows.slice(0, 3) : rows, null, 2)}
        `,
        18_000,
      );
    } catch {
      explain = Array.isArray(rows) && rows.length
        ? `✅ Truy vấn thành công (${rows.length} dòng).`
        : `Hiện chưa có dữ liệu phù hợp.`;
    }

    return { sql, rows, explain };
  }

  // ======================================================
  // SCHEMA
  // ======================================================
  private async refreshSchemaContext() {
    const cols = await this.ds.query(
      `
      SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name   = c.table_name
      WHERE t.table_type = 'BASE TABLE'
        AND c.table_schema = ANY($1)
      ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `,
      [[...this.SCHEMA_ALLOWLIST]],
    );

    this.COLUMN_NAME_MAP_BY_TABLE.clear();
    this.TABLE_COLUMN_ENUM_TYPE.clear();
    this.ENUM_LABEL_MAP.clear();

    const perTable: Record<string, string[]> = {};

    for (const r of cols) {
      const tableKey = `${r.table_schema}.${r.table_name}`;
      const col = String(r.column_name);
      const udt = String(r.udt_name || "");

      if (!this.COLUMN_NAME_MAP_BY_TABLE.has(tableKey)) {
        this.COLUMN_NAME_MAP_BY_TABLE.set(tableKey, new Map());
        perTable[tableKey] = [];
      }

      if (r.data_type === "USER-DEFINED" && udt) {
        if (!this.TABLE_COLUMN_ENUM_TYPE.has(tableKey)) {
          this.TABLE_COLUMN_ENUM_TYPE.set(tableKey, new Map());
        }
        this.TABLE_COLUMN_ENUM_TYPE.get(tableKey)!.set(col, udt);
      }

      const dtype =
        r.data_type === "USER-DEFINED" && udt ? `enum:${udt}` : r.data_type;

      perTable[tableKey].push(`${col} (${dtype})`);

      const m = this.COLUMN_NAME_MAP_BY_TABLE.get(tableKey)!;

      const norm = col.toLowerCase();
      m.set(norm, col);
      m.set(norm.replace(/_/g, ""), col);

      if (norm.includes("_")) {
        m.set(norm.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()), col);
      }
    }

    const enums = await this.ds.query(`
      SELECT t.typname AS enum_name, e.enumlabel AS enum_label
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
    `);

    for (const r of enums) {
      if (!this.ENUM_LABEL_MAP.has(r.enum_name)) {
        this.ENUM_LABEL_MAP.set(r.enum_name, new Map());
      }
      this.ENUM_LABEL_MAP.get(r.enum_name)!.set(
        r.enum_label.toLowerCase(),
        r.enum_label,
      );
    }

    this.schemaContext =
      "# DB Schema\n" +
      Object.entries(perTable)
        .map(
          ([tbl, cols]) =>
            `\n## ${tbl}\n${cols.map((c) => `- ${c}`).join("\n")}`,
        )
        .join("\n");

    this.schemaLoadedAt = Date.now();
  }

  private async ensureSchemaFresh(ttlMs: number) {
    if (!this.schemaLoadedAt || Date.now() - this.schemaLoadedAt > ttlMs) {
      await this.refreshSchemaContext();
    }
  }

  // ======================================================
  // LLM
  // ======================================================
  private async generateSql(
    question: string,
    context: string,
    opts?: { timezone?: string },
  ) {
    return this.llm.chat(
      `
Bạn là trợ lý PostgreSQL.
- Chỉ sinh 1 câu SELECT
- Mỗi bảng phải có alias
- Mọi cột bắt buộc alias.column
- Không đoán tên cột
      `.trim(),
      `Câu hỏi: ${question}\n\nSchema:\n${context}`,
      25_000,
    );
  }

  // ======================================================
  // SQL PROCESS
  // ======================================================
  private extractSQL(text: string): string {
    const m = text.match(/```sql([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
    if (m?.[1]) return m[1].trim();

    const idx = text.toLowerCase().indexOf("select ");
    if (idx >= 0) return text.slice(idx).trim();

    throw new Error("Không tìm thấy SELECT.");
  }

  private sanitize(sqlInput: string): string {
    let sql = sqlInput.trim().replace(/;+\s*$/g, "");

    if (!sql.toLowerCase().startsWith("select")) {
      throw new Error("Chỉ cho phép SELECT.");
    }

    // ==================================================
    // PARSE TABLE + ALIAS
    // ==================================================
    const aliasToTable = new Map<string, string>();

    const tblRe =
      /\b(from|join)\s+([a-z0-9_."']+)(?:\s+(?:as\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/gi;

    let m: RegExpExecArray | null;
    while ((m = tblRe.exec(sql))) {
      const raw = m[2].replace(/["']/g, "").split(/\s+/)[0];
      const alias = m[3] || raw.split(".").pop()!;
      aliasToTable.set(alias, raw.includes(".") ? raw : `public.${raw}`);
    }

    // ==================================================
    // REWRITE alias.column
    // ==================================================
    sql = sql.replace(
      /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
      (_, a, c) => {
        const tableKey = aliasToTable.get(a);
        if (!tableKey) return `${a}.${c}`;

        const map = this.COLUMN_NAME_MAP_BY_TABLE.get(tableKey);
        if (!map) return `${a}.${c}`;

        const real =
          map.get(c) ||
          map.get(c.toLowerCase()) ||
          map.get(c.toLowerCase().replace(/_/g, ""));

        if (!real) return `${a}.${c}`;
        return `${a}.${/[A-Z]/.test(real) ? `"${real}"` : real}`;
      },
    );

    // ==================================================
    // REWRITE bare column (NO alias, không mơ hồ)
    // ==================================================
   const KW = new Set([
  "select","from","join","where","and","or","on","as",
  "left","right","inner","outer","full","cross",
  "group","by","order","having","limit","offset",
  "distinct","union","all","except","intersect",
  "case","when","then","else","end",
  "asc","desc","nulls","first","last",
  "in","is","not","between","like","ilike","exists","any","some",
  "true","false","null",
  "count","sum","avg","min","max","coalesce","nullif","date_trunc","extract","now",
]);

 sql = sql.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match, token, offset, src) => {
  const lower = token.toLowerCase();

  // 1) Skip keywords/functions
  if (KW.has(lower)) return token;

  // 2) Skip aliases
  if (aliasToTable.has(token)) return token;

  // 3) Skip nếu token đang sát dấu .  => tránh đụng alias.column, schema.table
  const prev = src[offset - 1];
  const next = src[offset + token.length];
  if (prev === "." || next === ".") return token;

  // 4) Skip nếu token đang nằm trong quote (đơn giản: kề " hoặc ')
  if (prev === `"` || next === `"` || prev === `'` || next === `'`) return token;

  const hits: Array<{ alias: string; real: string }> = [];
  for (const [a, tableKey] of aliasToTable.entries()) {
    const m = this.COLUMN_NAME_MAP_BY_TABLE.get(tableKey);
    if (!m) continue;

    const real = m.get(token) || m.get(lower) || m.get(lower.replace(/_/g, ""));
    if (real) hits.push({ alias: a, real });
  }

  // chỉ rewrite khi khớp đúng 1 bảng -> không mơ hồ
  if (hits.length !== 1) return token;

  const { alias, real } = hits[0];
  const out = /[A-Z]/.test(real) ? `"${real}"` : real;
  return `${alias}.${out}`;
});

    // ==================================================
    // AUTO LIMIT
    // ==================================================
    if (
      !/\blimit\s+\d+/i.test(sql) &&
      !/\b(group\s+by|count\(|sum\(|avg\(|min\(|max\()/i.test(sql)
    ) {
      sql += ` LIMIT ${DEFAULT_MAX_LIMIT}`;
    }
if (sql.includes('""')) {
  this.logger.warn(`SmartSQL produced empty identifier: ${sql}`);
  throw new Error('SQL có identifier rỗng (""), vui lòng thử lại.');
}

    return sql;
  }
}
