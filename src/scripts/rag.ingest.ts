// src/scripts/rag.ingest.ts
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
   1) Helpers: chunking
   ───────────────────────────────────────────── */

function splitByParagraph(text: string, max = 1400): string[] {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  let buf = "";

  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed) out.push(trimmed);
    buf = "";
  };

  for (const p of paras) {
    const candidate = buf ? `${buf}\n\n${p}` : p;

    if (candidate.length <= max) {
      buf = candidate;
    } else {
      flush();

      if (p.length <= max) {
        buf = p;
      } else {
        let start = 0;
        while (start < p.length) {
          out.push(p.slice(start, start + max).trim());
          start += max;
        }
        buf = "";
      }
    }
  }

  flush();
  return out;
}

function cleanRawText(raw: string): string {
  return raw
    .replace(/^===== FILE:[^\n]*\n/gi, "")
    .replace(/===== END FILE =====/gi, "")
    .trim();
}

function splitDocBySection(raw: string, max = 1400): string[] {
  const text = cleanRawText(raw);
  const sections = text.split(/^##\s+/m);
  const results: string[] = [];

  if (sections[0]?.trim()) {
    results.push(...splitByParagraph(sections[0].trim(), max));
  }

  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];

    const nlIndex = sec.indexOf("\n");
    const heading = (nlIndex === -1 ? sec : sec.slice(0, nlIndex)).trim();
    const body = nlIndex === -1 ? "" : sec.slice(nlIndex + 1).trim();

    if (!heading && !body) continue;

    const full = (`## ${heading}\n${body}`).trim();

    if (full.length <= max) {
      results.push(full);
    } else {
      const paragraphs = splitByParagraph(body, max);
      if (paragraphs.length === 0) {
        results.push(...splitByParagraph(full, max));
        continue;
      }

      const [firstPara, ...rest] = paragraphs;
      let firstChunk = (`## ${heading}\n${firstPara}`).trim();
      if (firstChunk.length <= max) {
        results.push(firstChunk);
      } else {
        results.push(...splitByParagraph(firstChunk, max));
      }

      results.push(...rest);
    }
  }

  return results;
}

/* ─────────────────────────────────────────────
   2) Helpers: file & role detection
   ───────────────────────────────────────────── */

const fileExists = (p: string) => {
  try {
    return fss.statSync(p).isFile();
  } catch {
    return false;
  }
};

const DOC_ROOT = path.join(process.cwd(), "docs");

type RagRole = "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER" | "ALL";

function detectRoleByPath(filePath: string): RagRole {
  const s = filePath.toLowerCase().replace(/\\/g, "/");
  if (s.includes("/kitchen/")) return "KITCHEN";
  if (s.includes("/waiter/")) return "WAITER";
  if (s.includes("/cashier/")) return "CASHIER";
  if (s.includes("/manager/")) return "MANAGER";
  return "ALL";
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

/** UUID v5-like deterministic từ baseName + index (Qdrant chấp nhận như UUID) */
function makeDeterministicUUID(baseName: string, index: number): string {
  const hash = createHash("sha1")
    .update(`${baseName}::${index}`)
    .digest("hex"); // 40 kí tự
  // format thành 8-4-4-4-12 = 32 hex (bỏ bớt phần dư)
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

/* ─────────────────────────────────────────────
   3) MAIN
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
    console.log(
      "⚠️ Không tìm thấy file docs.\n" +
        "Ví dụ: npx ts-node -r tsconfig-paths/register -r dotenv/config " +
        "src/scripts/rag.ingest.ts ./docs/**/*.txt",
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

    // Nếu có file nào muốn skip (ví dụ sop_ menu), giữ rule này
    if (baseName.startsWith("sop_")) {
      console.log("⏭ skip SOP menu file:", baseName);
      continue;
    }

    const raw = await fs.readFile(f, "utf8");
    const chunks = splitDocBySection(raw, 1400);
    const role = detectRoleByPath(f);

    console.log(
      `📚 Ingest file: ${baseName} (role=${role}) → ${chunks.length} chunk(s)`,
    );

    for (let i = 0; i < chunks.length; i++) {
      const meta: any = {
        source: baseName,
        absPath: f,
        index: i,
        role,
      };

      const pointId = makeDeterministicUUID(baseName, i);

      console.log(`   ↳ chunk ${i} (id=${pointId})`);

      await rag.upsertDocChunk({
        id: pointId,
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
