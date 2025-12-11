// src/modules/rag/rag.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { LlmGateway } from "../ai/llm.gateway";

export type RagRole = "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER" | "ALL";

export type RagHit = {
  text: string;
  score?: number;
  source?: string;
  absPath?: string;
  index?: number;
};

@Injectable()
export class RagService {
  private readonly log = new Logger("RAG");

  private readonly qdrant = new QdrantClient({
    url: process.env.QDRANT_URL || "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY || undefined,
  });

  // collection schema
  private readonly schemaCollection =
    process.env.QDRANT_SCHEMA_COLLECTION || "restaurant_schema";

  // collection SOP/docs
  private readonly docCollection =
    process.env.QDRANT_DOC_COLLECTION || "restaurant_docs";

  constructor(private readonly llm: LlmGateway) {}

  // ========== EMBEDDINGS / COLLECTION ==========

  private async embed(input: string | string[]) {
    return this.llm.embed(input);
  }

  private async getEmbedDim(): Promise<number> {
    const v = await this.embed("probe");
    const arr =
      Array.isArray(v) && Array.isArray((v as any)[0])
        ? (v as number[][])[0]
        : (v as number[]);
    if (!arr?.length) throw new Error("Cannot infer embedding dimension");
    return arr.length;
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

  private normalizeVector(v: any): number[] {
    if (Array.isArray(v)) {
      if (Array.isArray(v[0])) {
        return v[0] as number[];
      }
      return v as number[];
    }
    throw new Error("Embedding vector is invalid");
  }

  // ========== UPSERT ==========

  async upsertSchemaChunk(ch: { id: string; text: string; meta?: any }) {
    await this.ensureCollection(this.schemaCollection);
    const v = await this.embed(ch.text);
    const vector = this.normalizeVector(v);

    const meta = ch.meta || {};

    await this.qdrant.upsert(this.schemaCollection, {
      wait: true,
      points: [
        {
          id: ch.id,
          vector,
          payload: {
            text: ch.text,
            ...meta,
            page_content: ch.text,
            pageContent: ch.text,
            metadata: { ...meta },
          },
        },
      ],
    });
  }

  async upsertDocChunk(ch: { id: string; text: string; meta?: any }) {
    await this.ensureCollection(this.docCollection);
    await this.ensureDocPayloadIndexes();

    const v = await this.embed(ch.text);
    const vector = this.normalizeVector(v);

    await this.qdrant.upsert(this.docCollection as any, {
      wait: true,
      points: [
        {
          id: ch.id,
          vector,
          payload: {
            page_content: ch.text,
            metadata: {
              ...(ch.meta || {}),
            },
          },
        },
      ],
    });
  }

  // ========== RAW SEARCH ==========

  async searchDocs(
    question: string,
    topK = Number(process.env.RAG_TOPK || 16),
    scoreThreshold = Number(process.env.RAG_SCORE_THRESHOLD || 0.05),
    filter?: any, // hiện tại luôn undefined (không filter role)
  ) {
    await this.ensureCollection(this.docCollection);
    await this.ensureDocPayloadIndexes();

    const v = await this.embed(question);
    const vector = this.normalizeVector(v);

    const r = await this.qdrant.search(this.docCollection as any, {
      vector,
      limit: topK,
      with_payload: true,
      filter,
    });

    const hits = (r || []) as Array<{
      score?: number;
      payload?: any;
    }>;

    return hits
      .filter((h) => (h.score ?? 0) >= scoreThreshold)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  // Không dùng role để filter nữa → query toàn bộ docs
  async query(
    question: string,
    opts?: { topK?: number; scoreThreshold?: number },
  ): Promise<RagHit[]> {
    const topK = opts?.topK ?? Number(process.env.RAG_TOPK || 16);
    const threshold =
      typeof opts?.scoreThreshold === "number"
        ? opts.scoreThreshold
        : Number(process.env.RAG_SCORE_THRESHOLD || 0.12);

    const hits = await this.searchDocs(question, topK, threshold, undefined);

    return (hits || []).map((h: any) => {
      const meta = (h.payload?.metadata || {}) as any;
      return {
        text:
          (h.payload?.page_content as string) ||
          (meta.text as string) ||
          "",
        score: h.score,
        source: meta.source,
        absPath: meta.absPath,
        index: meta.index,
      };
    });
  }

  // ========== LIGHT RAG ==========

  async askLight(
    question: string,
    opts?: { topK?: number },
  ): Promise<{
    answer: string;
    sources: { index: number; score?: number; source?: string }[];
  }> {
    const hits = await this.query(question, {
      topK: opts?.topK,
    });

    const context = hits
      .map(
        (h, i) =>
          `[${i + 1}] (${(h.score ?? 0).toFixed(3)}) ${h.source || ""}\n${h.text}`,
      )
      .join("\n\n---\n\n");

    const sys = `
Bạn là trợ lý nội bộ cho nhà hàng Seafood POS.
CHỈ được trả lời dựa trên phần "Tài liệu".
Nếu không có thông tin liên quan trong tài liệu, phải trả lời đúng câu:
"Không thấy trong tài liệu."
Trả lời tiếng Việt thân thiện, rõ ràng, ngắn gọn.
`.trim();

    const usr = `Câu hỏi: ${question}\n\nTài liệu:\n${context || "(trống)"}`;

    let answer = "";
    try {
      answer = (await this.llm.chat(sys, usr, 20_000)) || "";
    } catch (e) {
      this.log.warn(
        `[RAG.askLight] llm.chat error: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }

    const hasDocs = hits.length > 0;
    const norm = (answer || "").toLowerCase().normalize("NFC");
    const looksLikeNotFound =
      norm.includes("không thấy trong tài liệu") ||
      norm.includes("khong thay trong tai lieu") ||
      norm.includes("khong tim thay trong tai lieu");

    // Nếu có docs mà LLM lại nói "không thấy" hoặc im luôn → ép trả context
    if ((!answer || !answer.trim()) && hasDocs) {
      this.log.warn(
        `[RAG.askLight] Empty answer but has docs, using context fallback.`,
      );
      answer =
        "Theo tài liệu nội bộ, hệ thống tìm được các nội dung sau:\n\n" +
        context;
    } else if (looksLikeNotFound && hasDocs) {
      this.log.warn(
        `[RAG.askLight] LLM said 'không thấy trong tài liệu' but docs exist, overriding with context.`,
      );
      answer =
        "Theo tài liệu nội bộ, hệ thống tìm được các nội dung sau (bạn xem và áp dụng phù hợp):\n\n" +
        context;
    }

    // Nếu thực sự KHÔNG có docs → mới cho nói "Không thấy trong tài liệu."
    if ((!answer || !answer.trim()) && !hasDocs) {
      answer = "Không thấy trong tài liệu.";
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

  // Alias chung cho các nơi khác
  async ask(question: string, topK?: number) {
    return this.askLight(question, { topK });
  }

  // ========== PAYLOAD INDEXES & MAINTENANCE ==========

  private async ensureDocPayloadIndexes() {
    try {
      await this.qdrant.createPayloadIndex(this.docCollection as any, {
        field_name: "metadata.role",
        field_schema: "keyword",
      } as any);
      this.log.log("[RAG] Created payload index for metadata.role");
    } catch (e: any) {
      if (!/already exists/i.test(e?.message || "")) {
        this.log.warn(
          `[RAG] createPayloadIndex(metadata.role) error: ${
            e?.message || e
          }`,
        );
      }
    }

    try {
      await this.qdrant.createPayloadIndex(this.docCollection as any, {
        field_name: "metadata.source",
        field_schema: "keyword",
      } as any);
      this.log.log("[RAG] Created payload index for metadata.source");
    } catch (e: any) {
      if (!/already exists/i.test(e?.message || "")) {
        this.log.warn(
          `[RAG] createPayloadIndex(metadata.source) error: ${
            e?.message || e
          }`,
        );
      }
    }
  }

  async resetDocCollection() {
    this.log.warn(`[RAG] Deleting collection ${this.docCollection} ...`);
    try {
      await this.qdrant.deleteCollection(this.docCollection as any);
    } catch (e: any) {
      this.log.warn(
        `[RAG] deleteCollection(doc) error: ${e?.message || e}`,
      );
    }
    await this.ensureCollection(this.docCollection);
    this.log.warn(`[RAG] Doc collection recreated.`);
  }

  async resetSchemaCollection() {
    this.log.warn(
      `[RAG] Deleting collection ${this.schemaCollection} ...`,
    );
    try {
      await this.qdrant.deleteCollection(this.schemaCollection as any);
    } catch (e: any) {
      this.log.warn(
        `[RAG] deleteCollection(schema) error: ${
          e?.message || e
        }`,
      );
    }
    await this.ensureCollection(this.schemaCollection);
    this.log.warn(`[RAG] Schema collection recreated.`);
  }

  async deleteDocsBySource(source: string) {
    await this.ensureCollection(this.docCollection);
    try {
      await this.qdrant.delete(this.docCollection as any, {
        filter: {
          must: [
            {
              key: "metadata.source",
              match: { value: source },
            },
          ],
        },
      } as any);
      this.log.log(`[RAG] Deleted docs for source=${source}`);
    } catch (e: any) {
      this.log.warn(
        `[RAG] deleteDocsBySource(${source}) error: ${
          e?.message || e
        }`,
      );
    }
  }
}
