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
  const totalRows = Array.isArray(rows) ? rows.length : 0;

  // chỉ lấy mẫu 3 dòng để LLM hiểu cấu trúc
  const sample = Array.isArray(rows) ? rows.slice(0, 3) : rows;

  // (tuỳ chọn) cắt bớt rows trả về FE để FE khỏi nặng
  const MAX_RETURN_ROWS = Number(process.env.SMARTSQL_RETURN_ROWS || 50);
  const rowsForUi = Array.isArray(rows) ? rows.slice(0, MAX_RETURN_ROWS) : rows;

  let explain = "";
  try {
    explain = await this.llm.chat(
      [
        "Bạn là trợ lý nhà hàng thông minh.",
        "Trả lời tiếng Việt, dễ hiểu.",
        "QUAN TRỌNG:",
        "- Đừng suy ra số lượng bản ghi từ dữ liệu mẫu.",
        "- Phải dùng TOTAL_ROWS để nói có bao nhiêu kết quả.",
        "- Nếu TOTAL_ROWS > SAMPLE_ROWS, hãy nói rõ chỉ hiển thị ví dụ một vài dòng.",
      ].join("\n"),
      `
Câu hỏi: ${question}

SQL:
${sql}

TOTAL_ROWS: ${totalRows}
SAMPLE_ROWS: ${Array.isArray(sample) ? sample.length : 0}

Mẫu dữ liệu (tối đa 3 dòng):
${JSON.stringify(sample, null, 2)}
      `.trim(),
      18_000
    );
  } catch {
    explain = totalRows
      ? `✅ Truy vấn thành công (${totalRows} dòng).`
      : `Hiện chưa có dữ liệu phù hợp.`;
  }

  return { sql, rows: rowsForUi, meta: { totalRows }, explain };
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

QUAN TRỌNG TIMEZONE:
- Khi lọc "hôm nay/hôm qua/tuần này/tháng này" theo giờ Việt Nam (Asia/Ho_Chi_Minh),
  KHÔNG dùng: DATE(col)=CURRENT_DATE
- PHẢI dùng dạng:
  DATE(col AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  và "hôm qua":
  DATE(col AT TIME ZONE 'Asia/Ho_Chi_Minh') = DATE((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '1 day')
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
  this.logger.debug({ stage: "raw_sql", sql: sqlInput });

  let sql = sqlInput.trim().replace(/;+\s*$/g, "");

  if (!sql.toLowerCase().startsWith("select")) {
    throw new Error("Chỉ cho phép SELECT.");
  }

  // 1) normalize "a . b" => "a.b"
  sql = sql.replace(
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_"]*)\b/g,
    (_, a, b) => `${a}.${b}`,
  );
  this.logger.debug({ stage: "after_normalize_dot", sql });

  // 2) parse table + alias
  const aliasToTable = new Map<string, string>();
  const tblRe =
    /\b(from|join)\s+([a-z0-9_."']+)(?:\s+(?:as\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/gi;

  let m: RegExpExecArray | null;
  while ((m = tblRe.exec(sql))) {
    const raw = String(m[2] ?? "")
      .replace(/["']/g, "")
      .split(/\s+/)[0];

    const alias = m[3] || raw.split(".").pop()!;
    aliasToTable.set(alias, raw.includes(".") ? raw : `public.${raw}`);
  }

  this.logger.debug({
    stage: "after_parse_alias",
    aliases: Array.from(aliasToTable.entries()),
  });

  // 3) rewrite alias.column using COLUMN_NAME_MAP_BY_TABLE
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
  this.logger.debug({ stage: "after_alias_column", sql });

  // helper: check if position is inside single-quoted string (Postgres '' escape)
  const isInsideSingleQuote = (src: string, pos: number) => {
    let inSingle = false;
    for (let i = 0; i < pos; i++) {
      if (src[i] === "'") {
        if (src[i + 1] === "'") {
          i++; // skip escaped ''
          continue;
        }
        inSingle = !inSingle;
      }
    }
    return inSingle;
  };

  // helper: check if position is inside double-quoted identifier "..."
  const isInsideDoubleQuote = (src: string, pos: number) => {
    let inDouble = false;
    for (let i = 0; i < pos; i++) {
      if (src[i] === `"`) {
        // postgres identifier escape: "" inside "..."
        if (src[i + 1] === `"`) {
          i++;
          continue;
        }
        inDouble = !inDouble;
      }
    }
    return inDouble;
  };
// 3.5) rewrite enum literal values (WHERE alias.enum_col = 'value')
sql = sql.replace(
  /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*(=|!=|<>|IN)\s*(\([\s\S]*?\)|'[^']*')/gi,
  (full, alias, col, op, rhs) => {
    const tableKey = aliasToTable.get(alias);
    if (!tableKey) return full;

    const enumMap = this.TABLE_COLUMN_ENUM_TYPE.get(tableKey);
    if (!enumMap) return full;

    const enumName =
      enumMap.get(col) ||
      enumMap.get(col.toLowerCase()) ||
      enumMap.get(col.toLowerCase().replace(/_/g, ""));
    if (!enumName) return full;

    const labelMap = this.ENUM_LABEL_MAP.get(enumName);
    if (!labelMap) return full;

    if (op.toUpperCase() === "IN" && rhs.startsWith("(")) {
      const inner = rhs.slice(1, -1);
      const items = inner
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/^'|'$/g, ""));

      const mapped = items.map((v) => {
        const real = labelMap.get(v.toLowerCase());
        return real ? `'${real}'` : `'${v}'`;
      });

      return `${alias}.${col} IN (${mapped.join(", ")})`;
    }

    if (rhs.startsWith("'")) {
      const rawVal = rhs.replace(/^'|'$/g, "");
      const real = labelMap.get(rawVal.toLowerCase());
      if (!real) return full;
      return `${alias}.${col} ${op} '${real}'`;
    }

    return full;
  }
);

this.logger.debug({ stage: "after_enum_rewrite", sql });

// 3.6) rewrite "DATE(alias.created_at) = CURRENT_DATE" => timezone VN
sql = sql.replace(
  /\bDATE\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\.(created_at|updated_at)\s*\)\s*=\s*CURRENT_DATE\b/gi,
  (_full, a, col) =>
    `DATE(${a}.${col} AT TIME ZONE '${TZ_DEFAULT}') = DATE(NOW() AT TIME ZONE '${TZ_DEFAULT}')`
);

sql = sql.replace(
  /\bDATE\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\.(created_at|updated_at)\s*\)\s*=\s*CURRENT_DATE\s*-\s*INTERVAL\s*'1\s*day'\b/gi,
  (_full, a, col) =>
    `DATE(${a}.${col} AT TIME ZONE '${TZ_DEFAULT}') = DATE((NOW() AT TIME ZONE '${TZ_DEFAULT}') - INTERVAL '1 day')`
);

this.logger.debug({ stage: "after_tz_rewrite", sql });

  // 4) rewrite bare token (NO alias) only when unambiguous
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
    "current_date","current_timestamp",
  ]);

  sql = sql.replace(
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
    (match, token, offset: number, src: string) => {
      const lower = token.toLowerCase();

      // 1) keywords/functions
      if (KW.has(lower)) return token;

      // 2) table aliases
      if (aliasToTable.has(token)) return token;

      // 3) skip if adjacent to dot => avoid touching alias.column or schema.table
      const prev = src[offset - 1];
      const next = src[offset + token.length];
      if (prev === "." || next === ".") return token;

      // 4) skip if inside quotes
      if (isInsideSingleQuote(src, offset)) return token;
      if (isInsideDoubleQuote(src, offset)) return token;

      // 5) skip if token is output alias after AS
      const before = src.slice(Math.max(0, offset - 12), offset).toLowerCase();
      if (/\bas\s*$/.test(before)) return token;

      // 6) find matching column across aliases
      const hits: Array<{ alias: string; real: string }> = [];
      for (const [a, tableKey] of aliasToTable.entries()) {
        const mm = this.COLUMN_NAME_MAP_BY_TABLE.get(tableKey);
        if (!mm) continue;

        const real =
          mm.get(token) ||
          mm.get(lower) ||
          mm.get(lower.replace(/_/g, ""));

        if (real) hits.push({ alias: a, real });
      }

      // only rewrite when exactly 1 match -> not ambiguous
      if (hits.length !== 1) return token;

      const { alias, real } = hits[0];
      const out = /[A-Z]/.test(real) ? `"${real}"` : real;
      return `${alias}.${out}`;
    },
  );

  this.logger.debug({ stage: "after_bare_rewrite", sql });

  // 5) auto limit
  if (
    !/\blimit\s+\d+/i.test(sql) &&
    !/\b(group\s+by|count\(|sum\(|avg\(|min\(|max\()/i.test(sql)
  ) {
    sql += ` LIMIT ${DEFAULT_MAX_LIMIT}`;
  }

  // guard
  if (sql.includes('""')) {
    this.logger.warn(`SmartSQL produced empty identifier: ${sql}`);
    throw new Error('SQL có identifier rỗng (""), vui lòng thử lại.');
  }

  return sql;
}

  
}
