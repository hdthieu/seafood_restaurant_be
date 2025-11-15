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
const dirExists = (p: string) => {
  try {
    return fss.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
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
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });
  const rag = app.get(RagService);
  const args = process.argv.slice(2);
  const files = await readTargets(args);
  console.log("[RAG-Ingest] Found", files.length, "files");
  if (!files.length) console.log("👉 Ví dụ: node dist/scripts/rag.ingest.js ./docs/schema.sql ./docs/*.md");

 for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  const raw = await fs.readFile(f, "utf8");
  const chunks = splitText(raw, 1600);

  const isSchema = ext === ".sql";
  const isDoc = ext === ".txt" || ext === ".md";

  for (let i = 0; i < chunks.length; i++) {
    const meta = { source: path.basename(f), absPath: f, index: i };

    if (isSchema) {
      console.log("📘 schema →", f);
      await rag.upsertSchemaChunk({ id: randomUUID(), text: chunks[i], meta });
    } else if (isDoc) {
      console.log("📄 docs →", f);
      await rag.upsertDocChunk({ id: randomUUID(), text: chunks[i], meta });
    } else {
      console.log("⏭ skip:", f);
    }
  }
}


  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
