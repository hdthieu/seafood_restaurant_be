import { Injectable, Logger } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { LlmGateway } from "../ai/llm.gateway";

export type RagHit = { text: string; score?: number; source?: string; absPath?: string; index?: number };

@Injectable()
export class RagService {
  private readonly log = new Logger("RAG");
  private readonly qdrant = new QdrantClient({
    url: process.env.QDRANT_URL || "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY || undefined, // <- thêm dòng này
  });
  // collection schema
  private readonly schemaCollection =
    process.env.QDRANT_SCHEMA_COLLECTION || "restaurant_schema";

  // collection SOP/docs
  private readonly docCollection =
    process.env.QDRANT_DOC_COLLECTION || "restaurant_docs";
  constructor(private readonly llm: LlmGateway) {}

  private async embed(input: string | string[]) {
    return this.llm.embed(input);
  }

  private async getEmbedDim(): Promise<number> {
    const v = await this.embed("probe");
    const arr = Array.isArray(v) && Array.isArray((v as any)[0]) ? (v as number[][])[0] : (v as number[]);
    if (!arr?.length) throw new Error("Cannot infer embedding dimension");
    return arr.length; // e.g., 768 for text-embedding-004
  }

  private async ensureCollection(collection: string): Promise<number> {
  const dim = await this.getEmbedDim();

  try {
    const info: any = await this.qdrant.getCollection(collection as any);
    const currentDim =
      info?.result?.config?.params?.vectors?.size ??
      info?.config?.params?.vectors?.size ??
      info?.result?.config?.params?.vectors?.["float"]?.size ??
      null;

    if (currentDim && currentDim !== dim) {
      if (String(process.env.RAG_RESET || "0") !== "1") {
        throw new Error(
          `'${collection}' size=${currentDim}, embed=${dim}. Set RAG_RESET=1 to recreate.`,
        );
      }
      this.log.warn(`Recreating '${collection}' with size=${dim} ...`);
      await this.qdrant.deleteCollection(collection as any);
    }
  } catch (_) {}

  try {
    await this.qdrant.createCollection(collection as any, {
      vectors: { size: dim, distance: "Cosine" },
    } as any);
  } catch (e: any) {
    const conflict = e?.status === 409 || /exists/i.test(e?.message || "");
    if (!conflict) throw e;
  }

  return dim;
}


 async upsertSchemaChunk(ch: { id: string; text: string; meta?: any }) {
  await this.ensureCollection(this.schemaCollection);
 const v = await this.embed(ch.text);
const vector = this.normalizeVector(v);
await this.qdrant.upsert(this.schemaCollection, {
  wait: true,
  points: [{ id: ch.id, vector, payload: { text: ch.text, ...ch.meta } }],
});

}

async upsertDocChunk(ch: { id: string; text: string; meta?: any }) {
  await this.ensureCollection(this.docCollection);
 const v = await this.embed(ch.text);
const vector = this.normalizeVector(v);
await this.qdrant.upsert(this.docCollection, {
  wait: true,
  points: [{ id: ch.id, vector, payload: { text: ch.text, ...ch.meta } }],
});


}

private normalizeVector(v: any): number[] {
  // embed trả về [number[]] hoặc number[]
  if (Array.isArray(v)) {
    if (Array.isArray(v[0])) {
      return v[0] as number[];
    }
    return v as number[];
  }
  throw new Error("Embedding vector is invalid");
}

  async searchDocs(question: string, topK = 4, scoreThreshold = 0.18) {
  await this.ensureCollection(this.docCollection);
  const v = await this.embed(question);
  const vector = this.normalizeVector(v);


  const r = await this.qdrant.search(this.docCollection as any, {
    vector,
    limit: topK,
    with_payload: true,
    score_threshold: scoreThreshold,
  });

  return (r || []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}


  /** PUBLIC: cho AiService – trả danh sách hit gọn */
  async query(question: string, topK = Number(process.env.RAG_TOPK || 4)): Promise<RagHit[]> {
    const hits = await this.searchDocs(question, topK, Number(process.env.RAG_SCORE_THRESHOLD || 0.18));
    return (hits || []).map((h: any) => ({
      text: h.payload?.text || "",
      score: h.score,
      source: h.payload?.source,
      absPath: h.payload?.absPath,
      index: h.payload?.index,
    }));
  }

  /** Nếu muốn RAG tự tổng hợp trả lời (không bắt buộc) */
 /** Nếu muốn RAG tự tổng hợp trả lời (không bắt buộc) */
async ask(question: string, topK = Number(process.env.RAG_TOPK || 4)) {
  const hits = await this.query(question, topK);

  // Ghép context từ tài liệu
  const context = hits
    .map(
      (h, i) =>
        `[${i + 1}] (${(h.score || 0).toFixed(3)}) ${h.source || ""}\n${h.text}`,
    )
    .join("\n\n---\n\n");

  const sys =
    "Bạn là trợ lý nội bộ nhà hàng. CHỈ dựa vào tài liệu; nếu không chắc, trả 'Không tìm thấy trong tài liệu'.";
  const usr = `Câu hỏi: ${question}\n\nTài liệu:\n${context || "(trống)"}`;

  let answer = "";
  try {
    answer = (await this.llm.chat(sys, usr, 28000)) || "";
  } catch (e) {
    this.log.warn(`[RAG.ask] llm.chat error: ${e instanceof Error ? e.message : e}`);
  }

  // 🔹 Nếu LLM KHÔNG trả lời nhưng VẪN CÓ hits → fallback sang trả context thô
  if ((!answer || !answer.trim()) && hits.length > 0) {
    this.log.warn(
      `[RAG.ask] LLM không trả lời, dùng fallback từ context. hits=${hits.length}`,
    );
    answer =
      "Dưới đây là nội dung tài liệu liên quan mà hệ thống tìm được:\n\n" +
      context;
  }

  // 🔹 Nếu không có hits nào → cho phép trả "Không tìm thấy trong tài liệu."
  if ((!answer || !answer.trim()) && hits.length === 0) {
    answer = "Không tìm thấy trong tài liệu.";
  }

  return {
    answer: answer.trim(),
    sources: hits.map((h, i) => ({
      index: i + 1,
      score: h.score,
      source: h.source,
    })),
  };
}

}
