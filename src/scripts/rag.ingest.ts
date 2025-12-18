// scripts/rag.ingest.ts
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { RagService } from "../modules/rag/rag.service";

import * as fs from "node:fs/promises";
import * as fss from "node:fs";
import * as path from "node:path";
import fg from "fast-glob";
import { createHash } from "node:crypto";

/* ─────────────────────────────────────────────
   1) Helpers
   ───────────────────────────────────────────── */
// kiểm tra đường dẫn 
const fileExists = (p: string) => {
  try {
    return fss.statSync(p).isFile();
  } catch {
    return false;
  }
};

const DOC_ROOT = path.join(process.cwd(), "docs");

// Role nhận diện theo thư mục (chỉ để lưu metadata cho dễ debug)
type RagRole = "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER" | "ALL";

// Chủ đề tài liệu (dùng để filter HR / PCCC / Khiếu nại… nếu sau này cần)
type RagTopic = "HR" | "KHIEN_NAI" | "PCCC" | "OTHER";

// debug role
function detectRoleByPath(filePath: string): RagRole {
  const s = filePath.toLowerCase().replace(/\\/g, "/");

  if (s.includes("/kitchen/")) return "KITCHEN";
  if (s.includes("/waiter/")) return "WAITER";
  if (s.includes("/cashier/")) return "CASHIER";
  if (s.includes("/manager/")) return "MANAGER";

  return "ALL";
}
// filter theo chủ đề
function detectTopicByPath(filePath: string): RagTopic {
  const base = path.basename(filePath).toLowerCase();

  if (base.startsWith("hr_")) return "HR";
  if (base.includes("khieu") || base.includes("kieu_nai")) return "KHIEN_NAI";
  if (base.includes("pccc") || base.includes("chay") || base.includes("no"))
    return "PCCC";

  return "OTHER";
}

function buildPatterns(cliArgs: string[]): string[] {
  if (cliArgs?.length) {
    return cliArgs.map((a) => path.resolve(process.cwd(), a));
  }

  return [
    path.join(DOC_ROOT, "**/*.txt").replace(/\\/g, "/"),
    path.join(DOC_ROOT, "**/*.md").replace(/\\/g, "/"),
  ];
}
// trả về file danh sách
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
// uuid theo tên file
/* UUID deterministic (ổn định khi re-run ingest) */
function makeDeterministicUUID(baseName: string, index: number): string {
  const hash = createHash("sha1")
    .update(`${baseName}::${index}`)
    .digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}
// dọn rác
function cleanRaw(raw: string): string {
  return raw
    .replace(/^===== FILE:[^\n]*\n/gi, "")
    .replace(/===== END FILE =====/gi, "")
    .trim();
}

/* ─────────────────────────────────────────────
   2) MAIN
   ───────────────────────────────────────────── */

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });

  const rag = app.get(RagService);

  const args = process.argv.slice(2);
  const files = await readTargets(args);

  console.log("[RAG-Ingest] Found", files.length, "files");

  if (!files.length) {
    console.log("⚠️ Không tìm thấy file docs.");
  }

  // Reset collection nếu cần
  if (String(process.env.RAG_RESET || "0") === "1") {
    console.log("🔥 RAG_RESET=1 → reset docs collection...");
    await rag.resetDocCollection();
  } else {
    console.log("ℹ️ Giữ nguyên collection cũ, chỉ upsert thêm.");
  }

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".txt" && ext !== ".md") {
      console.log("⏭ Skip (not txt/md):", filePath);
      continue;
    }

    const baseName = path.basename(filePath);
    const raw = await fs.readFile(filePath, "utf8");
    const cleaned = cleanRaw(raw);

    const role = detectRoleByPath(filePath);
    const topic = detectTopicByPath(filePath);

    console.log(`📄 Ingest file: ${baseName} (role=${role}, topic=${topic})`);

    // 1 file = 1 chunk
    const pointId = makeDeterministicUUID(baseName, 0);

    await rag.upsertDocChunk({
      id: pointId,
      text: cleaned,
      meta: {
        source: baseName,
        absPath: filePath,
        index: 0,
        role,   // chỉ metadata, RAG không filter theo role nữa
        topic,
      },
    });

    console.log(`   ✔ Upserted chunk id=${pointId}`);
  }

  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
