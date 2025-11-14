import { Injectable, Logger } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { LlmGateway } from "../ai/llm.gateway";

export type RagHit = { text: string; score?: number; source?: string; absPath?: string; index?: number };

@Injectable()
export class RagService {
  private readonly log = new Logger("RAG");
  private readonly qdrant = new QdrantClient({ url: process.env.QDRANT_URL || "http://localhost:6333" });
  private readonly collection = process.env.QDRANT_COLLECTION || "sop_faq";

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

  private async ensureCollection(): Promise<number> {
    const dim = await this.getEmbedDim();
    try {
      const info: any = await this.qdrant.getCollection(this.collection as any);
      const currentDim =
        info?.result?.config?.params?.vectors?.size ??
        info?.config?.params?.vectors?.size ??
        info?.result?.config?.params?.vectors?.["float"]?.size ?? null;
      if (currentDim && currentDim !== dim) {
        if (String(process.env.RAG_RESET || "0") !== "1") {
          throw new Error(`'${this.collection}' size=${currentDim}, embed=${dim}. Set RAG_RESET=1 to recreate.`);
        }
        this.log.warn(`Recreating '${this.collection}' with size=${dim} ...`);
        await this.qdrant.deleteCollection(this.collection as any);
      }
    } catch (_) {}
    try {
      await this.qdrant.createCollection(this.collection as any, {
        vectors: { size: dim, distance: "Cosine" },
      } as any);
    } catch (e: any) {
      const conflict = e?.status === 409 || /already\s*exists/i.test(e?.message || "");
      if (!conflict) throw e;
    }
    return dim;
  }

  async upsertChunk(ch: { id: string; text: string; meta?: Record<string, any> }) {
    await this.ensureCollection();
    const v = await this.embed(ch.text);
    const vector = Array.isArray(v) && Array.isArray((v as any)[0]) ? (v as number[][])[0] : (v as number[]);
    await this.qdrant.upsert(this.collection as any, {
      wait: true,
      points: [{ id: ch.id, vector, payload: { text: ch.text, ...ch.meta } }],
    } as any);
  }

  async search(question: string, topK = Number(process.env.RAG_TOPK || 4), scoreThreshold = Number(process.env.RAG_SCORE_THRESHOLD || 0.18)) {
    await this.ensureCollection();
    const v = await this.embed(question);
    const vector = Array.isArray(v) && Array.isArray((v as any)[0]) ? (v as number[][])[0] : (v as number[]);
    const r = await this.qdrant.search(this.collection as any, {
      vector,
      limit: topK,
      with_payload: true,
      score_threshold: scoreThreshold,
      params: { hnsw_ef: 96 },
    } as any);
    return (r || []).sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
  }

  /** PUBLIC: cho AiService – trả danh sách hit gọn */
  async query(question: string, topK = Number(process.env.RAG_TOPK || 4)): Promise<RagHit[]> {
    const hits = await this.search(question, topK, Number(process.env.RAG_SCORE_THRESHOLD || 0.18));
    return (hits || []).map((h: any) => ({
      text: h.payload?.text || "",
      score: h.score,
      source: h.payload?.source,
      absPath: h.payload?.absPath,
      index: h.payload?.index,
    }));
  }

  /** Nếu muốn RAG tự tổng hợp trả lời (không bắt buộc) */
  async ask(question: string, topK = Number(process.env.RAG_TOPK || 4)) {
    const hits = await this.query(question, topK);
    const context = hits.map((h, i) => `[${i + 1}] (${(h.score || 0).toFixed(3)}) ${h.source || ""}\n${h.text}`).join("\n\n---\n\n");
    const sys = "Bạn là trợ lý nội bộ nhà hàng. CHỈ dựa vào tài liệu; nếu không chắc, trả 'Không tìm thấy trong tài liệu'.";
    const usr = `Câu hỏi: ${question}\n\nTài liệu:\n${context || "(trống)"}`;
    const answer = await this.llm.chat(sys, usr, 28000);
    return {
      answer: (answer || "Không tìm thấy trong tài liệu.").trim(),
      sources: hits.map((h, i) => ({ index: i + 1, score: h.score, source: h.source })),
    };
  }
}
