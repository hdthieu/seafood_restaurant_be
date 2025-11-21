import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { RagService } from "../modules/rag/rag.service";
import * as fs from "node:fs/promises";
import * as fss from "node:fs";
import * as path from "node:path";
import fg from "fast-glob";
import { randomUUID } from "node:crypto";

function splitText(text: string, max = 1600): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let buf: string[] = [];
  let len = 0;
  for (const ln of lines) {
    const l = ln.length + 1;
    if (len + l > max && buf.length) {
      out.push(buf.join("\n"));
      buf = [];
      len = 0;
    }
    buf.push(ln);
    len += l;
  }
  if (buf.length) out.push(buf.join("\n"));
  return out;
}

// Chia docs .txt/.md theo heading "##" cho dễ truy vấn RAG
function splitDocBySection(text: string, max = 1200): string[] {
  // Tách theo heading level 2
  const parts = text.split(/^##\s+/m);
  const out: string[] = [];

  // Phần trước heading đầu tiên (nếu có)
  if (parts[0]?.trim()) {
    out.push(...splitText(parts[0].trim(), max));
  }

  for (let i = 1; i < parts.length; i++) {
    const body = parts[i];

    const nl = body.indexOf("\n");
    const heading = (nl === -1 ? body : body.slice(0, nl)).trim();
    const rest = nl === -1 ? "" : body.slice(nl + 1);

    let sectionText = `## ${heading}\n${rest}`.trim();
    if (!sectionText) continue;

    if (sectionText.length <= max) {
      out.push(sectionText);
    } else {
      // nếu section quá dài thì lại chia nhỏ bằng splitText
      out.push(...splitText(sectionText, max));
    }
  }

  return out;
}
const fileExists = (p: string) => {
  try {
    return fss.statSync(p).isFile();
  } catch {
    return false;
  }
};

function buildPatterns(cliArgs: string[]): string[] {
  if (cliArgs?.length) {
    return cliArgs.map((a) => path.resolve(process.cwd(), a));
  }

  const root = process.cwd();

  return [
    path.join(root, "docs/**/*.sql").replace(/\\/g, "/"),
    path.join(root, "docs/**/*.txt").replace(/\\/g, "/"),
    path.join(root, "docs/**/*.md").replace(/\\/g, "/"),
  ];
}


async function readTargets(cliArgs: string[]) {
  const patterns = buildPatterns(cliArgs);
  console.log("[RAG-Ingest] Patterns:", patterns);
  const files = await fg(patterns, { absolute: true, onlyFiles: true, unique: true, suppressErrors: true });
  for (const arg of cliArgs || []) {
    const abs = path.resolve(process.cwd(), arg);
    if (fileExists(abs) && !files.includes(abs)) files.push(abs);
  }
  return files;
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });
  const rag = app.get(RagService);

  const args = process.argv.slice(2);
  const files = await readTargets(args);
  console.log("[RAG-Ingest] Found", files.length, "files");
  if (!files.length) {
    console.log(
      " Ví dụ: node dist/scripts/rag.ingest.js ./docs/schema.sql ./docs/*.md",
    );
  }

  // 🔥 BƯỚC 1: XÓA HẾT collection rồi tạo lại (chỉ cần khi bạn muốn reset)
  // Bật bằng env để tránh lỡ tay xóa nhầm
  if (String(process.env.RAG_RESET || "0") === "1") {
    console.log("🔥 RAG_RESET=1 → reset schema & docs collections...");
    await rag.resetSchemaCollection();
    await rag.resetDocCollection();
  } else {
    console.log(
      "ℹ️ RAG_RESET!=1 → giữ nguyên dữ liệu cũ, chỉ upsert thêm/ghi đè.",
    );
  }
 
  // 🔁 BƯỚC 2: Ingest lại toàn bộ file
for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  const raw = await fs.readFile(f, "utf8");

  const isDoc = ext === ".txt" || ext === ".md";
  if (!isDoc) {
    console.log("⏭ skip (not doc):", f);
    continue;
  }

  const chunks = splitDocBySection(raw, 1200);

  // 👉 map file → role (như bạn đã làm)
  let role: string | undefined;
  const base = path.basename(f).toLowerCase();
  if (base.includes("sop_bep")) role = "KITCHEN";
  else if (base.includes("sop_phuc_vu")) role = "WAITER";
  else if (base.includes("sop_thu_ngan")) role = "CASHIER";
  else if (base.includes("sop_quan_ly")) role = "MANAGER";
  else if (base.includes("sop_tong_quat")) role = "ALL";

  for (let i = 0; i < chunks.length; i++) {
    const meta: any = {
      source: path.basename(f),
      absPath: f,
      index: i,
    };
    if (role) meta.role = role;

    console.log(`📄 docs → ${f} chunk ${i}`);
    await rag.upsertDocChunk({ id: randomUUID(), text: chunks[i], meta });
  }
}



  await app.close();
}


run().catch((e) => {
  console.error(e);
  process.exit(1);
});
