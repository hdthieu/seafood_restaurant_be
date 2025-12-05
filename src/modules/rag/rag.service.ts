// src/modules/rag/rag.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { LlmGateway } from "../ai/llm.gateway";
import { GatewayEmbeddings } from "./langchain-embeddings";
import { QdrantVectorStore } from "@langchain/qdrant";
import { Document } from "@langchain/core/documents";
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
    const arr = Array.isArray(v) && Array.isArray((v as any)[0])
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

  private normalizeVector(v: any): number[] {
    if (Array.isArray(v)) {
      if (Array.isArray(v[0])) {
        return v[0] as number[];
      }
      return v as number[];
    }
    throw new Error("Embedding vector is invalid");
  }

  // ========== RAW SEARCH (Qdrant REST) ==========

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

  async query(
    question: string,
    topK = Number(process.env.RAG_TOPK || 16),
    scoreThreshold?: number,
  ): Promise<RagHit[]> {
    const threshold =
      typeof scoreThreshold === "number"
        ? scoreThreshold
        : Number(process.env.RAG_SCORE_THRESHOLD || 0.18);

    const hits = await this.searchDocs(question, topK, threshold);

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

  // ========== RAG.ask (LLM tóm tắt) ==========

  async ask(question: string, topK = Number(process.env.RAG_TOPK || 4)) {
    const hits = await this.query(question, topK);

    const context = hits
      .map(
        (h, i) =>
          `[${i + 1}] (${(h.score || 0).toFixed(3)}) ${h.source || ""}\n${h.text}`,
      )
      .join("\n\n---\n\n");

   const sys = `
Bạn là trợ lý nội bộ của nhà hàng.

NHIỆM VỤ:
- Chỉ dựa vào phần "Tài liệu" để trả lời.
- Trả lời NGẮN GỌN, đúng TRỌNG TÂM câu hỏi.
- Nếu câu hỏi dạng "quy trình", "các bước", "workflow":
  → Trả lời theo dạng:
    1) ...
    2) ...
    3) ...
- Nếu tài liệu có thông tin liên quan, BẮT BUỘC phải dùng để trả lời.
- Chỉ được trả lời đúng 1 câu:
  "Không tìm thấy trong tài liệu."
  khi thật sự KHÔNG có thông tin liên quan NÀO trong toàn bộ tài liệu.

Trả lời tiếng Việt thân thiện, rõ ràng.
`.trim();


    const usr = `Câu hỏi: ${question}\n\nTài liệu:\n${context || "(trống)"}`;

    let answer = "";
    try {
      answer = (await this.llm.chat(sys, usr, 28_000)) || "";
    } catch (e) {
      this.log.warn(
        `[RAG.ask] llm.chat error: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }

    if ((!answer || !answer.trim()) && hits.length > 0) {
      this.log.warn(
        `[RAG.ask] LLM không trả lời, dùng fallback từ context. hits=${hits.length}`,
      );
      answer =
        "Dưới đây là nội dung tài liệu liên quan mà hệ thống tìm được:\n\n" +
        context;
    }

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

  // ========== PAYLOAD INDEXES ==========

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

  // ========== LangChain VectorStore ==========

  private lcEmbeddings?: GatewayEmbeddings;
  private lcVectorStore?: QdrantVectorStore;

  private async getVectorStore() {
    if (this.lcVectorStore) return this.lcVectorStore;

    this.lcEmbeddings = new GatewayEmbeddings(this.llm);

    this.lcVectorStore =
      await QdrantVectorStore.fromExistingCollection(
        this.lcEmbeddings,
        {
          url: process.env.QDRANT_URL || "http://localhost:6333",
          apiKey: process.env.QDRANT_API_KEY || undefined,
          collectionName: this.docCollection,
          contentPayloadKey: "page_content",
          metadataPayloadKey: "metadata",
        },
      );

    return this.lcVectorStore;
  }

  // ========== Query Expansion (không ép file) ==========

  private buildEnrichedQuestion(question: string): string {
    const q = question.toLowerCase();
    const keywords: string[] = [];

    // Khiếu nại khách
    if (
      q.includes("khiếu nại") ||
      q.includes("khieu nai") ||
      q.includes("phàn nàn") ||
      q.includes("phan nan") ||
      q.includes("complain")
    ) {
      keywords.push(
        "khiếu nại khách",
        "phàn nàn của khách",
        "xử lý phàn nàn",
        "quy trình xử lý khiếu nại",
        "khách không hài lòng",
      );
    }

    // Giờ giấc / chấm công
    if (
      q.includes("giờ giấc") ||
      q.includes("gio giac") ||
      q.includes("đi trễ") ||
      q.includes("di tre") ||
      q.includes("về sớm") ||
      q.includes("ve som") ||
      q.includes("chấm công") ||
      q.includes("cham cong")
    ) {
      keywords.push(
        "quy định giờ giấc làm việc",
        "đi trễ về sớm",
        "nội quy chấm công",
        "quy định chấm công",
      );
    }

    // Thưởng phạt / kỷ luật
    if (
      q.includes("thưởng phạt") ||
      q.includes("thuong phat") ||
      q.includes("kỷ luật") ||
      q.includes("ky luat") ||
      q.includes("khen thưởng") ||
      q.includes("khen thuong")
    ) {
      keywords.push(
        "quy định thưởng phạt",
        "nội quy kỷ luật",
        "quy định khen thưởng",
        "chính sách thưởng phạt",
        "xử lý vi phạm nội quy",
      );
    }

    // PCCC
    if (
      q.includes("cháy") ||
      q.includes("chay") ||
      q.includes("nổ") ||
      q.includes("no ") ||
      q.includes("pccc") ||
      q.includes("hoả hoạn") ||
      q.includes("hoa hoan")
    ) {
      keywords.push(
        "phòng cháy chữa cháy",
        "xử lý cháy nổ",
        "an toàn PCCC",
        "quy trình PCCC",
      );
    }

    if (!keywords.length) return question;

    return `${question}\n\nTỪ KHÓA LIÊN QUAN: ${keywords.join(", ")}`;
  }

  // ========== LLM RERANK (B) ==========

  private async rerankDocsWithLLM(
    docs: Document[],
    question: string,
  ): Promise<Document[]> {
    if (!docs.length) return docs;

    // Giới hạn số doc gửi lên LLM cho đỡ nặng
    const MAX_RERANK = 20;
    const slice = docs.slice(0, MAX_RERANK);

    const sys = `
Bạn là mô-đun RERANK tài liệu cho trợ lý nội bộ nhà hàng.

NHIỆM VỤ:
- Nhận vào câu hỏi + một danh sách đoạn tài liệu (doc).
- Xếp hạng các doc theo mức độ LIÊN QUAN đến câu hỏi, từ cao đến thấp.
- Chỉ trả về DANH SÁCH CHỈ SỐ, dạng: "0, 5, 2, 1, 3" (sử dụng chỉ số đã cho).
- Không giải thích, không thêm từ nào khác.

Nếu không chắc, cứ dựa trên mức độ gần nghĩa với câu hỏi.
Trả về ÍT NHẤT 1 chỉ số.
`.trim();

    const docsText = slice
      .map((d, i) => {
        const meta = (d as any).metadata || {};
        const src = meta.source || "";
        let txt = (d as any).pageContent || (d as any).page_content || "";
        txt = txt.replace(/^=+\s*FILE:[^\n]*\n/gi, "").trim();
        if (txt.length > 500) {
          txt = txt.slice(0, 500) + " …";
        }
        return `[#${i}] source=${src}\n${txt}`;
      })
      .join("\n\n---\n\n");

    const usr = `
Câu hỏi: """${question}"""

DANH SÁCH DOC:
${docsText}

Hãy trả về danh sách chỉ số (ví dụ: "0, 2, 1, 3").
`.trim();

    const out = await this.llm.chat(sys, usr, 12_000);
    const raw = (out || "").trim();
    if (!raw) return docs;

    // Parse chuỗi "0, 5, 2, 1"
    const idxs = raw
      .split(/[^0-9]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < slice.length);

    if (!idxs.length) return docs;

    const reordered: Document[] = [];
    const used = new Set<number>();

    for (const i of idxs) {
      if (!used.has(i)) {
        reordered.push(slice[i]);
        used.add(i);
      }
    }

    // Thêm các doc còn lại (nếu LLM không liệt kê đủ)
    slice.forEach((d, i) => {
      if (!used.has(i)) reordered.push(d);
    });

    // Nếu docs gốc nhiều hơn MAX_RERANK → nối phần còn lại phía sau
    if (docs.length > MAX_RERANK) {
      reordered.push(...docs.slice(MAX_RERANK));
    }

    return reordered;
  }

 async askWithLangChain(
  question: string,
  opts?: {
    topK?: number;
    role?: "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER" | "ALL";
    scoreThreshold?: number; // tạm chưa dùng vì LangChain không trả score
  },
) {
  await this.ensureCollection(this.docCollection);
  await this.ensureDocPayloadIndexes();

  const topK = opts?.topK ?? Number(process.env.RAG_TOPK || 40);
  const role = opts?.role;

  const store = await this.getVectorStore();

  // ===== 1) Filter theo role =====
  const must: any[] = [];
  const q = question.toLowerCase();
  let deptRole: RagRole | null = null;

  if (q.includes("bếp") || q.includes("bep") || q.includes("kitchen")) {
    deptRole = "KITCHEN";
  } else if (
    q.includes("phục vụ") ||
    q.includes("phuc vu") ||
    q.includes("waiter")
  ) {
    deptRole = "WAITER";
  } else if (
    q.includes("thu ngân") ||
    q.includes("thu ngan") ||
    q.includes("cashier")
  ) {
    deptRole = "CASHIER";
  } else if (
    q.includes("quản lý") ||
    q.includes("quan ly") ||
    q.includes("manager")
  ) {
    deptRole = "MANAGER";
  }

 let roleFilter: RagRole | null = null;

// đoán bộ phận theo câu hỏi
if (deptRole) {
  roleFilter = deptRole;
} else if (role && role !== "ALL" && role !== "MANAGER") {
  // 👈 MANAGER coi như ALL, không filter
  roleFilter = role;
}

if (roleFilter) {
  must.push({
    key: "metadata.role",
    match: { any: [roleFilter, "ALL"] },
  });
}


  const filter = must.length ? { must } : undefined;

  // ===== 2) Query expansion + vector search =====
  const enrichedQuestion = this.buildEnrichedQuestion(question);

  const docs = (await store.similaritySearch(
    enrichedQuestion,
    topK,
    filter,
  )) as Document[];

  this.log.log(
    `[RAG] [LangChain] query="${question}" enriched="${enrichedQuestion}" docs=${docs.length}`,
  );
  docs.forEach((d: any, i) => {
    this.log.log(
      `[RAG] [${i}] src=${d.metadata?.source} idx=${d.metadata?.index} role=${d.metadata?.role}`,
    );
  });

  if (!docs.length) {
    return {
      answer: "Không tìm thấy trong tài liệu.",
      sources: [],
    };
  }

  // ===== 3) Rerank bằng LLM (nếu lỗi thì giữ nguyên) =====
  let rankedDocs = docs;
  try {
    rankedDocs = await this.rerankDocsWithLLM(docs, question);
  } catch (e: any) {
    this.log.warn(`[RAG] rerankDocsWithLLM error: ${e?.message || e}`);
  }

  // ===== 4) Chọn doc dùng làm context (giới hạn cho gọn) =====
  const MAX_CONTEXT_DOCS = 6;

  // Option: ưu tiên các chunk cùng source với doc tốt nhất, nhưng vẫn giới hạn số lượng
  const bestSource = (rankedDocs[0] as any).metadata?.source as
    | string
    | undefined;

  let selectedDocs: Document[];
  if (bestSource) {
    const sameSource = rankedDocs.filter(
      (d: any) => d.metadata?.source === bestSource,
    );
    sameSource.sort(
      (a: any, b: any) => (a.metadata?.index ?? 0) - (b.metadata?.index ?? 0),
    );
    selectedDocs = sameSource.slice(0, MAX_CONTEXT_DOCS);
  } else {
    selectedDocs = rankedDocs.slice(0, MAX_CONTEXT_DOCS);
  }

  const context = selectedDocs
    .map((d: any, i) => {
      let txt = d.pageContent ?? d.page_content ?? "";
      txt = String(txt)
        .replace(/^=+\s*FILE:[^\n]*\n/gi, "")
        .trim();
      return `[#${i + 1}] source=${d.metadata?.source ?? ""}\n${txt}`;
    })
    .join("\n\n---\n\n");

  // ===== 5) Gọi LLM trả lời dựa trên context =====
  const sys = `
Bạn là trợ lý nội bộ của nhà hàng.

NHIỆM VỤ:
- Chỉ dựa vào phần "Tài liệu" để trả lời.
- Trả lời NGẮN GỌN, đúng TRỌNG TÂM câu hỏi.
- Nếu câu hỏi dạng "quy trình", "các bước", "workflow":
  → Trả lời theo dạng:
    1) ...
    2) ...
    3) ...
- Không bịa, không thêm nội dung bên ngoài.
- Nếu thật sự không có thông tin liên quan, trả lời đúng 1 câu:
  "Không tìm thấy trong tài liệu."

Trả lời tiếng Việt thân thiện, rõ ràng.
`.trim();

  const usr = `
Câu hỏi: ${question}

Tài liệu:
${context || "(trống)"}
`.trim();

  // ... sau khi build `context` và gọi LLM:

let answer = "";
try {
  answer = (await this.llm.chat(sys, usr, 28_000)) || "";
} catch (e) {
  this.log.warn(
    `[RAG.askWithLangChain] llm.chat error: ${
      e instanceof Error ? e.message : e
    }`,
  );
}

// ===== Fallback thông minh =====
const hasDocs = rankedDocs.length > 0;
const normAnswer = (answer || "").toLowerCase().normalize("NFC");

// Nếu LLM bảo "không tìm thấy" nhưng thực ra MÌNH có docs → không cho nói câu đó
const looksLikeNotFound =
  normAnswer.includes("không tìm thấy trong tài liệu") ||
  normAnswer.includes("khong tim thay trong tai lieu");

if ((!answer || !answer.trim()) && hasDocs) {
  // LLM im luôn → show context
  this.log.warn(
    `[RAG.askWithLangChain] Empty answer but has docs, using context fallback.`,
  );
  answer =
    "Theo tài liệu nội bộ, thông tin liên quan như sau:\n\n" + context;
} else if (looksLikeNotFound && hasDocs) {
  // LLM nói "không tìm thấy" mà thực tế có doc → override
  this.log.warn(
    `[RAG.askWithLangChain] LLM said 'không tìm thấy' but docs exist, overriding with context.`,
  );
  answer =
    "Theo tài liệu nội bộ, hệ thống tìm được các nội dung sau (bạn xem và áp dụng phù hợp):\n\n" +
    context;
}

// Nếu thực sự KHÔNG có docs → mới cho nói "Không tìm thấy trong tài liệu."
if (!answer?.trim() && !hasDocs) {
  answer = "Không tìm thấy trong tài liệu.";
}

return {
  answer: answer.trim(),
  sources: selectedDocs.map((d: any, i) => ({
    index: i + 1,
    source: d.metadata?.source,
    role: d.metadata?.role,
  })),
};
}
// src/modules/rag/rag.service.ts

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
      `[RAG] deleteDocsBySource(${source}) error: ${e?.message || e}`,
    );
  }
}

}
