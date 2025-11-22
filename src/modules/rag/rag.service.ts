import { Injectable, Logger } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { LlmGateway } from "../ai/llm.gateway";
import { GatewayEmbeddings } from "./langchain-embeddings";
import { QdrantVectorStore } from "@langchain/qdrant";
import { Document } from "@langchain/core/documents";

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

  const meta = ch.meta || {};

  await this.qdrant.upsert(this.schemaCollection, {
    wait: true,
    points: [
      {
        id: ch.id,
        vector,
        payload: {
          // giữ layout cũ
          text: ch.text,
          ...meta,
          // layout chuẩn cho LangChain
          page_content: ch.text,
          pageContent: ch.text,        // thêm luôn cho chắc
          metadata: { ...meta },
        },
      },
    ],
  });
}

// RagService

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
          // 👇 đúng chuẩn LangChain
          page_content: ch.text,
          metadata: {
            ...(ch.meta || {}),
          },
        },
      },
    ],
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

 // 🟢 KHÔNG động vào phần trên…

// 🟢 KHÔNG động vào phần trên…

async searchDocs(
  question: string,
  topK = Number(process.env.RAG_TOPK || 16),
  scoreThreshold = Number(process.env.RAG_SCORE_THRESHOLD || 0.05),
  filter?: any,
) {
  await this.ensureCollection(this.docCollection);
  await this.ensureDocPayloadIndexes();

  const v = await this.embed(question);
  const vector = this.normalizeVector(v);

  const r = await this.qdrant.search(this.docCollection as any, {
    vector,
    limit: topK,
    with_payload: true,
    // ❌ không dùng score_threshold ở Qdrant để khỏi bị loại sớm
    // score_threshold: scoreThreshold,
    filter,
  });

  const hits = (r || []) as Array<{
    score?: number;
    payload?: any;
  }>;

  // 🧹 Tự lọc theo scoreThreshold & sort giảm dần
  return hits
    .filter((h) => (h.score ?? 0) >= scoreThreshold)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}


/** PUBLIC: cho AiService / script debug – trả danh sách hit gọn */
async query(
  question: string,
  topK = Number(process.env.RAG_TOPK || 16),
  scoreThreshold?: number,           // 🔧 cho phép override
): Promise<RagHit[]> {
  const threshold =
    typeof scoreThreshold === "number"
      ? scoreThreshold
      : Number(process.env.RAG_SCORE_THRESHOLD || 0.18);

  // ❌ BỎ hết filter theo tên file kiểu sop_quan_ly.txt
  // vì giờ metadata.source là manager_quy_tac_chung.txt, waiter_..., v.v.
  const hits = await this.searchDocs(question, topK, threshold);

  return (hits || []).map((h: any) => {
    const meta = (h.payload?.metadata || {}) as any;

    return {
      // 🔧 đọc đúng chỗ
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




  /** PUBLIC: cho AiService – trả danh sách hit gọn */



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

 const sys = `
Bạn là trợ lý nội bộ của nhà hàng.

NHIỆM VỤ:
- Chỉ dựa vào phần "Tài liệu" bên dưới để trả lời.
- Trả lời NGẮN GỌN, đúng TRỌNG TÂM câu hỏi.
- Nếu câu hỏi dạng "quy trình", "các bước", "workflow":
  → Chỉ trích đúng các bước liên quan, theo dạng:
    1) ...
    2) ...
    3) ...
- Không được đưa nội dung từ các phần SOP khác nếu không liên quan
  (vd: hỏi quy trình chế biến món → KHÔNG được trả lời về hủy món, đổi món, hết nguyên liệu…).
- Nếu tài liệu có 1 phần liên quan, phải dùng phần đó để trả lời,
  không được trả "Không tìm thấy" khi trong tài liệu có thông tin đúng chủ đề.
- Chỉ trả đúng câu: "Không tìm thấy trong tài liệu."
  khi thật sự không có thông tin nào liên quan.

Trả lời tiếng Việt.
`.trim();

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
  // 🔥 Dùng cho script ingest – xóa toàn bộ điểm trong Qdrant rồi tạo lại
private async ensureDocPayloadIndexes() {
  // index cho metadata.role
  try {
    await this.qdrant.createPayloadIndex(this.docCollection as any, {
      field_name: "metadata.role",
      field_schema: "keyword",
    } as any);
    this.log.log("[RAG] Created payload index for metadata.role");
  } catch (e: any) {
    if (!/already exists/i.test(e?.message || "")) {
      this.log.warn(`[RAG] createPayloadIndex(metadata.role) error: ${e?.message || e}`);
    }
  }

  // OPTIONAL: index cho metadata.source
  try {
    await this.qdrant.createPayloadIndex(this.docCollection as any, {
      field_name: "metadata.source",
      field_schema: "keyword",
    } as any);
    this.log.log("[RAG] Created payload index for metadata.source");
  } catch (e: any) {
    if (!/already exists/i.test(e?.message || "")) {
      this.log.warn(`[RAG] createPayloadIndex(metadata.source) error: ${e?.message || e}`);
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
    // tạo lại collection rỗng với đúng vector dim
    await this.ensureCollection(this.docCollection);
    this.log.warn(`[RAG] Doc collection recreated.`);
  }

  async resetSchemaCollection() {
    this.log.warn(`[RAG] Deleting collection ${this.schemaCollection} ...`);
    try {
      await this.qdrant.deleteCollection(this.schemaCollection as any);
    } catch (e: any) {
      this.log.warn(
        `[RAG] deleteCollection(schema) error: ${e?.message || e}`,
      );
    }
    await this.ensureCollection(this.schemaCollection);
    this.log.warn(`[RAG] Schema collection recreated.`);
  }




   private lcEmbeddings?: GatewayEmbeddings;
  private lcVectorStore?: QdrantVectorStore;

private async getVectorStore() {
  if (this.lcVectorStore) return this.lcVectorStore;

  this.lcEmbeddings = new GatewayEmbeddings(this.llm);

  this.lcVectorStore = await QdrantVectorStore.fromExistingCollection(
    this.lcEmbeddings,
    {
      url: process.env.QDRANT_URL || "http://localhost:6333",
      apiKey: process.env.QDRANT_API_KEY || undefined,
      collectionName: this.docCollection,

      // 👇 khai báo đúng key đã dùng khi upsert
      contentPayloadKey: "page_content",
      metadataPayloadKey: "metadata",
    },
  );

  return this.lcVectorStore;
}

  /** RAG dùng LangChain + lọc theo role (optional) */
  // import ở đầu file


// ...


async askWithLangChain(
  question: string,
  opts?: {
    topK?: number;
    role?: "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER" | "ALL";
    scoreThreshold?: number; // hiện chưa dùng ở đây, có thể dùng nếu muốn
  },
) {
  await this.ensureCollection(this.docCollection);
  await this.ensureDocPayloadIndexes();

  const topK = opts?.topK ?? Number(process.env.RAG_TOPK || 8);
  const role = opts?.role;

  const store = await this.getVectorStore();

  const must: any[] = [];

  // 🔍 Ưu tiên đoán bộ phận từ nội dung câu hỏi
  const q = question.toLowerCase();
  let deptRole: "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER" | null = null;

  if (q.includes("bếp") || q.includes("bep") || q.includes("kitchen")) {
    deptRole = "KITCHEN";
  } else if (q.includes("phục vụ") || q.includes("phuc vu") || q.includes("waiter")) {
    deptRole = "WAITER";
  } else if (q.includes("thu ngân") || q.includes("thu ngan") || q.includes("cashier")) {
    deptRole = "CASHIER";
  } else if (q.includes("quản lý") || q.includes("quan ly") || q.includes("manager")) {
    deptRole = "MANAGER";
  }

  // 🔧 Chọn role để lọc:
  // - Nếu câu hỏi nói rõ bộ phận → dùng deptRole
  // - Nếu không, mà ctx.role là KITCHEN/WAITER/CASHIER → dùng ctx.role
  let roleFilter: "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER" | null = null;

  if (deptRole) {
    roleFilter = deptRole;
  } else if (role && role !== "ALL" && role !== "MANAGER") {
    roleFilter = role;
  }

  // Nếu có roleFilter → lọc theo [roleFilter, "ALL"]
  if (roleFilter) {
    must.push({
      key: "metadata.role",
      match: { any: [roleFilter, "ALL"] },
    });
  }

  const filter = must.length ? { must } : undefined;

  // 🧠 Lấy docs từ Qdrant qua LangChain
  const docs = (await store.similaritySearch(
    question,
    topK,
    filter,
  )) as Document[];

  this.log.log(
    `[RAG] [LangChain] query="${question}" docs=${docs.length}`,
  );
  docs.forEach((d: any, i) => {
    this.log.log(
      `[RAG] [${i}] src=${d.metadata?.source} idx=${d.metadata?.index} role=${d.metadata?.role}`,
    );
  });

  // ❌ Không có doc nào luôn → chịu, báo thẳng
  if (!docs.length) {
    return {
      answer: "Không tìm thấy trong tài liệu.",
      sources: [],
    };
  }

  // 🔥 Chỉ dùng 1–3 chunk đầu để tránh nhiễu (ưu tiên chunk tốt nhất)
  const primary = docs.slice(0, 3);

  const context = primary
    .map(
      (d) =>
        `=== ${d.metadata?.source ?? ""} (idx=${d.metadata?.index}) ===\n${d.pageContent}`,
    )
    .join("\n\n");

  const sysPrompt = `
Bạn là trợ lý nội bộ của nhà hàng.
Chỉ dùng nội dung trong phần TÀI LIỆU dưới đây để trả lời.
Nếu không đủ thông tin, trả lời đúng câu: "Không tìm thấy trong tài liệu."

TÀI LIỆU:
${context || "(trống)"}
  `.trim();

  const NO_DATA = "Không tìm thấy trong tài liệu.";

  const rawAnswer = await this.llm.chat(sysPrompt, question, 30_000);
  let answer = (rawAnswer || "").trim();

  // ⚠️ Nếu LLM im lặng *hoặc* trả NO_DATA trong khi rõ ràng có docs
  if (!answer || answer.includes(NO_DATA)) {
    answer =
      "Dưới đây là nội dung tài liệu liên quan mà hệ thống tìm được:\n\n" +
      context;
  }

  return {
    answer,
    // Trả đủ list nguồn để FE show "Nguồn tham chiếu"
    sources: docs.map((d: any) => ({
      source: d.metadata?.source,
      index: d.metadata?.index,
      score: d.metadata?.score, // nếu sau này muốn ghi thêm
    })),
  };
}





}


