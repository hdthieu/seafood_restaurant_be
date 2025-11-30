// src/scripts/rag.ingest.ts
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

// Chia docs .txt/.md theo heading "##"
function splitDocBySection(text: string, max = 1200): string[] {
  const parts = text.split(/^##\s+/m);
  const out: string[] = [];

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

const DOC_ROOT = path.join(process.cwd(), "docs");

// map theo THƯ MỤC
function detectRoleByPath(filePath: string):
  | "KITCHEN"
  | "WAITER"
  | "CASHIER"
  | "MANAGER"
  | "ALL" {
  const s = filePath.toLowerCase().replace(/\\/g, "/");
  if (s.includes("/kitchen/")) return "KITCHEN";
  if (s.includes("/waiter/")) return "WAITER";
  if (s.includes("/cashier/")) return "CASHIER";
  if (s.includes("/manager/")) return "MANAGER";
  return "ALL"; // general, hr, ...
}

function buildPatterns(cliArgs: string[]): string[] {
  if (cliArgs?.length) {
    return cliArgs.map((a) => path.resolve(process.cwd(), a));
  }
  const root = DOC_ROOT;
  return [
    path.join(root, "**/*.txt").replace(/\\/g, "/"),
    path.join(root, "**/*.md").replace(/\\/g, "/"),
  ];
}

async function readTargets(cliArgs: string[]) {
  const patterns = buildPatterns(cliArgs);
  console.log("[RAG-Ingest] Patterns:", patterns);
  const files = await fg(patterns, {
    absolute: true,
    onlyFiles: true,
    unique: true,
    suppressErrors: true,
  });

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
      "⚠️ Không tìm thấy file docs.\n" +
        "Ví dụ: npx ts-node -r tsconfig-paths/register -r dotenv/config src/scripts/rag.ingest.ts ./docs/**/*.txt",
    );
  }

  if (String(process.env.RAG_RESET || "0") === "1") {
    console.log("🔥 RAG_RESET=1 → reset docs collection...");
    await rag.resetDocCollection();
  } else {
    console.log("ℹ️ RAG_RESET!=1 → giữ nguyên dữ liệu cũ, chỉ upsert thêm/ghi đè.");
  }

for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  if (ext !== ".txt" && ext !== ".md") {
    console.log("⏭ skip (not txt/md):", f);
    continue;
  }

  const baseName = path.basename(f);

  // 🚫 1) BỎ QUA CÁC FILE SOP MENU (sop_noi_quy_lao_dong.txt, sop_*.txt)
  if (baseName.startsWith("sop_")) {
    console.log("⏭ skip SOP menu file:", baseName);
    continue;
  }

  const raw = await fs.readFile(f, "utf8");

  const chunks = splitDocBySection(raw, 1200);

  const role = detectRoleByPath(f);

  for (let i = 0; i < chunks.length; i++) {
    const meta: any = {
      source: baseName,
      absPath: f,
      index: i,
      role,
    };

    console.log(`📄 docs → ${baseName} [${role}] chunk ${i}`);
    await rag.upsertDocChunk({
      id: randomUUID(),
      text: chunks[i],
      meta,
    });
  }
}



  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
