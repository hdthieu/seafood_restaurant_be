import { Embeddings } from "@langchain/core/embeddings";
import type { AsyncCallerParams } from "@langchain/core/utils/async_caller";
import { LlmGateway } from "../ai/llm.gateway"; // tuỳ bạn để path

export class GatewayEmbeddings extends Embeddings {
  constructor(private readonly llm: LlmGateway, params?: AsyncCallerParams) {
    super(params ?? {}); // 👈 bắt buộc truyền object vào đây
  }

  // embed 1 câu hỏi
  async embedQuery(text: string): Promise<number[]> {
    const v = await this.llm.embed(text); // dùng đúng hàm embed bạn đã xài để upsert vào Qdrant
    // v có thể là number[] hoặc number[][]
    if (Array.isArray(v) && Array.isArray(v[0])) {
      return v[0] as number[];
    }
    return v as number[];
  }

  // embed nhiều document
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const v = await this.llm.embed(texts); // embed batch
    if (!Array.isArray(v)) {
      throw new Error("embedDocuments return invalid");
    }
    if (Array.isArray(v[0])) {
      return v as number[][];
    }
    // lỡ đâu backend trả về 1 vector cho tất cả -> bọc lại
    return [v as number[]];
  }
}
