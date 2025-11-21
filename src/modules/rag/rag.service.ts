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

  async searchDocs(
  question: string,
  topK = 4,
  scoreThreshold = 0.18,
  sourceFilter?: string,        // 👈 thêm
) {
  await this.ensureCollection(this.docCollection);
    await this.ensureDocPayloadIndexes();
  const v = await this.embed(question);
  const vector = this.normalizeVector(v);

  const filter = sourceFilter
    ? {
        must: [
          {
            key: "metadata.source", 
            match: { value: sourceFilter },
          },
        ],
      }
    : undefined;

  const r = await this.qdrant.search(this.docCollection as any, {
    vector,
    limit: topK,
    with_payload: true,
    score_threshold: scoreThreshold,
    filter,                     // 👈 truyền filter vào
  });

  return (r || []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}



  /** PUBLIC: cho AiService – trả danh sách hit gọn */
 async query(
  question: string,
  topK = Number(process.env.RAG_TOPK || 4),
): Promise<RagHit[]> {
  const q = question.toLowerCase();

  let sourceFilter: string | undefined;
  if (q.includes("bếp")) {
    sourceFilter = "sop_bep.txt";
  } else if (q.includes("phục vụ")) {
    sourceFilter = "sop_phuc_vu.txt";
  } else if (q.includes("thu ngân") || q.includes("thu ngân")) {
    sourceFilter = "sop_thu_ngan.txt";
  } else if (q.includes("quản lý")) {
    sourceFilter = "sop_quan_ly.txt";
  }

  const hits = await this.searchDocs(
    question,
    topK,
    Number(process.env.RAG_SCORE_THRESHOLD || 0.18),
    sourceFilter,
  );

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
    scoreThreshold?: number;
  },
) {
  await this.ensureCollection(this.docCollection);
  await this.ensureDocPayloadIndexes();

  const topK = opts?.topK ?? Number(process.env.RAG_TOPK || 8);
  const scoreThreshold =
    opts?.scoreThreshold ?? Number(process.env.RAG_SCORE_THRESHOLD || 0.05);
  const role = opts?.role;

  const store = await this.getVectorStore();

  const must: any[] = [];
  const q = question.toLowerCase();

  // 1) Lọc theo role (trừ MANAGER, MANAGER đọc được hết)
  if (role && role !== "ALL" && role !== "MANAGER") {
    must.push({
      key: "metadata.role",
      match: { any: [role, "ALL"] },
    });
  }

  // 2) Lọc thêm theo nguồn SOP theo từ khoá trong câu hỏi
  const sources: string[] = [];

  if (q.includes("thu ngân") || q.includes("thu ngan") || q.includes("cashier")) {
    sources.push("sop_thu_ngan.txt");
  }
  if (q.includes("phục vụ") || q.includes("phuc vu") || q.includes("phục vụ")) {
    sources.push("sop_phuc_vu.txt");
  }
  if (q.includes("bếp") || q.includes("kitchen")) {
    sources.push("sop_bep.txt");
  }
  if (q.includes("quản lý") || q.includes("quan ly") || q.includes("manager")) {
    sources.push("sop_quan_ly.txt");
  }

  // luôn cho phép SOP tổng quát nếu đã match bộ phận nào đó
  if (sources.length > 0) {
    sources.push("sop_tong_quat.txt");
    must.push({
      key: "metadata.source",
      match: { any: sources },
    });
  }

  const filter = must.length ? { must } : undefined;

  const docs = (await store.similaritySearch(
    question,
    topK,
    filter,
  )) as Document[];

  const filtered = docs.filter((d: any) => {
    const s =
      typeof d.metadata?.score === "number"
        ? d.metadata.score
        : typeof d.score === "number"
        ? d.score
        : undefined;
    if (typeof s !== "number") return true;
    return s >= scoreThreshold;
  });

  this.log.log(
    `[RAG] [LangChain] query="${question}" docs=${docs.length}, filtered=${filtered.length}`,
  );
  filtered.forEach((d, i) => {
    this.log.log(
      `[RAG] [${i}] src=${d.metadata?.source} idx=${d.metadata?.index} role=${d.metadata?.role}`,
    );
  });

  const context = filtered
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

 const rawAnswer = await this.llm.chat(sysPrompt, question, 30_000);
let answer = (rawAnswer || "").trim();

if (!answer || !answer.trim()) {
  if (filtered.length === 0) {
    answer = "Không tìm thấy trong tài liệu.";
  } else {
    // không xả context nữa, nói nhẹ nhàng thôi
    answer =
      "Mình đã tìm được một số đoạn trong SOP liên quan, nhưng chưa tóm tắt được rõ ràng. Bạn có thể mở trực tiếp tài liệu hoặc hỏi cụ thể hơn nhé.";
  }
}



  return {
    answer: (answer || "Không tìm thấy trong tài liệu.").trim(),
    sources: filtered.map((d: any) => ({
      source: d.metadata?.source,
      index: d.metadata?.index,
      score: d.metadata?.score,
    })),
  };
}



}


