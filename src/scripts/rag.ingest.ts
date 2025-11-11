import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { RagService } from "../modules/rag/rag.service";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as globby from "globby";
import { randomUUID } from "node:crypto";

function splitText(text: string, max = 1200): string[] {
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

async function readTargets(args: string[]) {
  const patterns = args.length ? args : ["./docs/**/*.sql", "./docs/**/*.md"];
  const glob = (globby as any).globby || (globby as any);
  const files = await glob(patterns, { absolute: true });
  return files as string[];
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "error", "warn"] });
  const rag = app.get(RagService);

  const files = await readTargets(process.argv.slice(2));
  console.log("[RAG-Ingest] Found", files.length, "files");

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (![".sql", ".md", ".txt"].includes(ext)) continue;

    const raw = await fs.readFile(f, "utf8");
    const chunks = splitText(raw, 1600);

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      await rag.upsertChunk({
        id: randomUUID(), // Qdrant yêu cầu int/uuid → dùng uuid string OK
        text,
        meta: { source: path.basename(f), index: i, ext },
      });
    }
  }

  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
