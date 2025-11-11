import { Injectable, Logger } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

// ---- Cấu hình mặc định ----
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const PROVIDER = (process.env.EMBED_PROVIDER || "ollama").toLowerCase();
const EMB_MODEL = process.env.EMBED_MODEL || "nomic-embed-text";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Qdrant
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "restaurant_schema";

// Một số model phổ biến và dimension “biết chắc”
const KNOWN_DIMS: Record<string, number> = {
  "nomic-embed-text": 768,
  "all-minilm:33m": 384,
  "bge-m3": 1024,
  "text-embedding-3-small": 1536, // OpenAI
  "text-embedding-3-large": 3072, // OpenAI
};

type Chunk = {
  id: string; // dùng UUID string
  text: string;
  meta?: Record<string, any>;
};

@Injectable()
export class RagService {
  private readonly log = new Logger("RAG");
  private readonly provider = PROVIDER;
  private readonly embedModel = EMB_MODEL;

  private readonly openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
  private readonly qdrant = new QdrantClient({ url: QDRANT_URL });
  private readonly collection = QDRANT_COLLECTION;

  // cache dimension
  private _dimCache: number | null = null;

  // =============== Embedding ===============

  /** Gọi embeddings với mô hình hiện tại (tự tương thích Ollama SDK/HTTP và prompt/input). */
  private async embed(input: string | string[]): Promise<number[] | number[][]> {
    if (this.provider === "openai") {
      if (!this.openai) throw new Error("OPENAI_API_KEY is missing");
      const r = await this.openai.embeddings.create({
        model: this.embedModel.replace(/^openai:/, ""),
        input,
      });
      // OpenAI luôn trả batch
      return Array.isArray(input) ? r.data.map(d => d.embedding) : (r.data[0].embedding as number[]);
    }

    // ---- OLLAMA ----
    // 1) thử HTTP API trực tiếp (ổn định giữa các version)
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.embedModel.replace(/^ollama:/, ""),
          // Nhiều version dùng 'prompt', một số fork dùng 'input' — gửi cả hai.
          prompt: input,
          input,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`/api/embeddings HTTP ${res.status} ${text}`);
      }
      const j: any = await res.json();
      if (Array.isArray(input)) {
        // có thể là {embeddings: number[][]} hoặc {data:[{embedding:[]}...]}
        const arr = j.embeddings || j.data?.map((x: any) => x.embedding);
        if (!arr) throw new Error("Ollama embeddings: invalid response");
        return arr as number[][];
      } else {
        const vec = j.embedding || j.data?.[0]?.embedding;
        if (!vec) throw new Error("Ollama embeddings: invalid response");
        return vec as number[];
      }
    } catch (e) {
      this.log.warn(`Ollama HTTP embeddings failed: ${String((e as any)?.message || e)}`);
    }

    // 2) fallback Ollama JS SDK (nếu cài)
    try {
      // tránh import tĩnh để không phụ thuộc kiểu types giữa versions
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ollama = require("ollama");
      const args: any = { model: this.embedModel.replace(/^ollama:/, "") };
      // một số SDK yêu cầu 'prompt', một số 'input' — thử 'prompt' trước
      let resp: any;
      try {
        resp = await ollama.embeddings({ ...args, prompt: input });
      } catch {
        resp = await ollama.embeddings({ ...args, input });
      }
      if (Array.isArray(input)) {
        return (resp.embeddings || resp.data?.map((x: any) => x.embedding)) as number[][];
      }
      return (resp.embedding || resp.data?.[0]?.embedding) as number[];
    } catch (e) {
      // bỏ qua
      this.log.error(`Ollama SDK embeddings failed: ${String((e as any)?.message || e)}`);
    }

    throw new Error("Cannot get embeddings from provider.");
  }

  /** Lấy dim của model, có cache + nhiều đường dự phòng. */
  private async getEmbedDim(): Promise<number> {
    if (this._dimCache) return this._dimCache;

    // 1) Known map
    const key = this.embedModel.replace(/^.*:/, "");
    if (KNOWN_DIMS[key]) {
      this._dimCache = KNOWN_DIMS[key];
      return this._dimCache;
    }

    // 2) thử gọi show model (Ollama)
    if (this.provider === "ollama") {
      try {
        const res = await fetch(`${OLLAMA_BASE}/api/show`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: this.embedModel.replace(/^ollama:/, "") }),
        });
        if (res.ok) {
          const j: any = await res.json();
          const dim = j?.model_info?.embedding_length || j?.parameters?.embedding_length;
          if (dim) {
            this._dimCache = Number(dim);
            return this._dimCache;
          }
        }
      } catch {
        // bỏ qua
      }
    }

    // 3) probe bằng cách embed 1 câu và lấy length
    const v = await this.embed("dimension probe");
    const arr = Array.isArray(v) && Array.isArray((v as any)[0]) ? (v as number[][])[0] : (v as number[]);
    if (!arr || !arr.length) throw new Error("Cannot get embedding dimension from provider.");
    this._dimCache = arr.length;
    return this._dimCache;
  }

  // =============== Qdrant ===============

  /** Đảm bảo collection tồn tại. Nếu dim lệch & `RAG_RESET=1` thì drop & recreate. */
  private async ensureCollection(): Promise<number> {
    const dim = await this.getEmbedDim();

    try {
      const info: any = await this.qdrant.getCollection(this.collection as any);
      // client này thường trả { result: {...} }, nhưng types có thể khác → dùng any
      const currentDim =
        info?.result?.config?.params?.vectors?.size ??
        info?.config?.params?.vectors?.size ??
        null;

      const vectorsCount =
        info?.result?.vectors_count ??
        info?.vectors_count ??
        0;

      if (currentDim && currentDim !== dim) {
        const canReset = String(process.env.RAG_RESET || "0") === "1";
        const msg = `Qdrant collection '${this.collection}' has dim=${currentDim}, embed dim=${dim}.`;
        if (!canReset) {
          throw new Error(`${msg} Set RAG_RESET=1 to recreate automatically.`);
        }
        this.log.warn(`${msg} Dropping & recreating due to RAG_RESET=1 ...`);
        await this.qdrant.deleteCollection(this.collection as any);
        await this.qdrant.createCollection(this.collection as any, {
          vectors: { size: dim, distance: "Cosine" },
        } as any);
        return dim;
      }

      if (!currentDim) {
        // chưa có → tạo mới
        await this.qdrant.createCollection(this.collection as any, {
          vectors: { size: dim, distance: "Cosine" },
        } as any);
      }

      // tối ưu nhỏ: nếu chưa có vector nào, coi như mới
      if (!vectorsCount) {
        this.log.log(`Qdrant collection '${this.collection}' ready (dim=${dim}).`);
      }
      return dim;
    } catch (e) {
      // collection có thể chưa tồn tại
      this.log.log(`Creating Qdrant collection '${this.collection}' (dim=${dim}) ...`);
      await this.qdrant.createCollection(this.collection as any, {
        vectors: { size: dim, distance: "Cosine" },
      } as any);
      return dim;
    }
  }

  // =============== Ingest/Search APIs ===============

  /** Upsert 1 chunk vào Qdrant. Tự ensure collection và đúng dimension trước. */
  async upsertChunk(ch: Chunk) {
    await this.ensureCollection();

    // vector hoá
    const vec = await this.embed(ch.text);
    const vector = Array.isArray(vec) && Array.isArray((vec as any)[0]) ? (vec as number[][])[0] : (vec as number[]);
    if (!vector?.length) throw new Error("Empty vector from provider.");

    await this.qdrant.upsert(this.collection as any, {
      wait: true,
      points: [
        {
          id: ch.id, // UUID string hợp lệ
          vector,
          payload: {
            text: ch.text,
            ...ch.meta,
          },
        },
      ],
    } as any);
  }

  /** Tìm kiếm semantic. */
  async search(question: string, topK = 6) {
    await this.ensureCollection();

    const vec = await this.embed(question);
    const queryVector = Array.isArray(vec) && Array.isArray((vec as any)[0]) ? (vec as number[][])[0] : (vec as number[]);

    const r = await this.qdrant.search(this.collection as any, {
      vector: queryVector,
      limit: topK,
      with_payload: true,
      score_threshold: 0.2,
    } as any);

    return r;
  }

  /** Chat trả lời trên nền context RAG (không huấn luyện). */
  async ask(question: string, topK = 6) {
    const hits = await this.search(question, topK);
    const context = (hits || [])
      .map((h: any) => h.payload?.text)
      .filter(Boolean)
      .join("\n\n---\n\n");

    const sys = `Bạn là kỹ sư dữ liệu PostgreSQL của hệ thống nhà hàng.
Trả lời CHÍNH XÁC dựa trên schema/chính sách dưới đây. Nếu không chắc, nói "Không tìm thấy trong tài liệu".`;
    const usr = `Câu hỏi: ${question}\n\nTài liệu liên quan:\n${context || "(trống)"}`;

    // Ưu tiên Ollama để tránh rate-limit
    const reply = await this.chatLLM(sys, usr);
    const sources = (hits || []).map((h: any, i: number) => ({
      index: i + 1,
      score: h.score,
      id: h.id,
    }));
    return { answer: reply, sources };
  }

  // =============== Helper chat (Ollama ưu tiên) ===============

  private async chatLLM(system: string, user: string): Promise<string> {
    if (process.env.LLM_PROVIDER?.toLowerCase() === "openai" && this.openai) {
      try {
        const r = await this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        return r.choices?.[0]?.message?.content?.trim() || "";
      } catch (e) {
        this.log.warn(`OpenAI chat failed -> fallback Ollama: ${String((e as any)?.message || e)}`);
      }
    }

    // Fallback Ollama
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b",
          stream: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      const j: any = await res.json();
      return j?.message?.content ?? "";
    } catch (e) {
      this.log.error(`Ollama chat failed: ${String((e as any)?.message || e)}`);
      return "";
    }
  }
  private extractSql(text: string): string {
  if (!text) throw new Error("LLM không trả về gì.");
  const m =
    text.match(/```sql([\s\S]*?)```/i) ||
    text.match(/```([\s\S]*?)```/i);
  if (m?.[1]) return m[1].trim().replace(/;+\s*$/g, "");
  const idx = text.toLowerCase().indexOf("select ");
  if (idx >= 0) {
    return text
      .slice(idx)
      .replace(/[\u0000-\u001F]+/g, " ")
      .replace(/;+\s*$/g, "")
      .trim();
  }
  throw new Error("Không tìm thấy câu SQL trong phản hồi LLM.");
}

/** Sinh đúng 1 câu SELECT dựa trên câu hỏi + context RAG. */
async generateSql(question: string, context: string, opts?: { timezone?: string }): Promise<string> {
  const tz = opts?.timezone || "Asia/Ho_Chi_Minh";
  const system = `
Bạn là trợ lý PostgreSQL. Hãy sinh **DUY NHẤT** 1 câu lệnh **SELECT** (không CTE, không ; cuối),
chỉ đọc dữ liệu. NGHIÊM CẤM UPDATE/DELETE/INSERT/ALTER/DROP/TRUNCATE.
Ưu tiên dùng cột thời gian "created_at" nếu cần lọc ngày; mặc định là **hôm nay** theo múi giờ ${tz}.
Trả về **chỉ** block \`\`\`sql ...\`\`\`.
  `.trim();

  const user = `
Câu hỏi: ${question}

Ngữ cảnh/schema (RAG):
${context || "(trống)"}

Yêu cầu:
- Dùng đúng tên bảng/cột theo schema.
- Nếu dự kiến trả quá nhiều dòng, thêm LIMIT 200 (trừ khi dùng COUNT/AGG).
- Không giải thích, chỉ trả \`\`\`sql\`\`\`.
  `.trim();

  const reply = await this.chatLLM(system, user);
  return this.extractSql(reply);
}
}
