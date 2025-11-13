import { Injectable, Logger } from "@nestjs/common";
import { ToolsService } from "./tools.service";
import { RagService } from "../rag/rag.service";
import { LlmGateway } from "./llm.gateway";

type UiMsg = { role: "user" | "assistant"; content: string };
const isUi = (m: any): m is UiMsg =>
  m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly tools: ToolsService,
    private readonly rag: RagService,
    private readonly llm: LlmGateway,
  ) {}

  private isDataIntent(q: string) {
    return /(top|best.?selling|bán.*chạy|phổ\s*biến)/i.test(q)
        || /(bao\s*nhiêu|mấy|số\s*lượng|tổng|đếm|count|doanh\s*thu|revenue|hôm nay|hôm qua|7\s*ngày|theo\s*giờ|theo\s*ngày)/i.test(q)
        || /(món|menu|order|invoice|order_items?|hóa\s*đơn|đơn\s*hàng|khách|bàn|nhân\s*viên|ingredient|nguyên\s*liệu)/i.test(q);
  }

  async route(messages: UiMsg[]) {
  const question = (messages || []).filter(m => m?.role === "user").pop()?.content?.trim() || "";
  if (!question) return { role: "assistant", content: "Xin chào 👋" };

  // 1️⃣ SmartSQL cho câu hỏi dữ liệu
  if (this.tools.isDataQuestion(question)) {
    try {
      const { sql, rows, explain, sources } = await this.tools.runSmartQuery(question);
      return { role: "assistant", content: explain, data: { sql, rows, sources } };
    } catch (e: any) {
      this.logger.warn(`[SmartSQL failed] ${e}`);
      // nếu lỗi SQL thì vẫn fallback sang Gemini
    }
  }

  // 2️⃣ RAG cho tài liệu nội bộ
  let usedRag = false;
  try {
    const ragResults = await this.rag.query(question, Number(process.env.RAG_TOPK || 4));
    const threshold = Number(process.env.RAG_SCORE_THRESHOLD || 0.2);
    if (ragResults.length && (ragResults[0].score ?? 0) >= threshold) {
      usedRag = true;
      const ctx = ragResults
        .map((r, i) => `#${i + 1} (${(r.score ?? 0).toFixed(3)}) ${r.source || ""}\n${r.text}`)
        .join("\n\n---\n\n");
      const answer = await this.llm.chat(
        "Bạn là trợ lý nội bộ nhà hàng. Chỉ dựa vào tài liệu sau để trả lời.",
        `Câu hỏi: ${question}\n\nTài liệu:\n${ctx}`,
        28000,
      );
      // Nếu RAG không tạo ra câu trả lời thực tế → fallback Gemini
      if (answer && !/tài liệu|schema|cấu trúc cơ sở dữ liệu/i.test(answer))
        return { role: "assistant", content: answer };
    }
  } catch (e) {
    this.logger.warn(`[RAG failed] ${e}`);
  }

  // 3️⃣ Nếu RAG không có thông tin hoặc câu hỏi không liên quan → Gemini Chat tổng quát
  this.logger.log(`Fallback to Gemini chat: ${question}`);
  const text = await this.llm.chat(
  `Bạn là trợ lý AI thân thiện, biết dùng Markdown để trình bày gọn gàng.
  - Mở đầu câu trả lời bằng lời chào tự nhiên (ví dụ: "Chào bạn! 😊" hoặc "Xin chào 👋").
  - Khi trả lời, hãy chia ý bằng đoạn, gạch đầu dòng hoặc **in đậm** nếu phù hợp.
  - Nếu người dùng hỏi về món ăn, hãy gợi ý chi tiết, nhóm theo loại món (món Việt, món Á, món Âu...).
  - Nếu câu hỏi chung chung (như lễ hội, kiến thức, văn hóa) thì trả lời ngắn gọn, dễ hiểu, có cảm xúc.`,
  question,
  30000,
);

  return {
    role: "assistant",
    content: text || (usedRag
      ? "Tài liệu nội bộ không có thông tin, nhưng mình có thể giúp bạn tìm hiểu thêm nếu bạn muốn!"
      : "Mình chưa hiểu rõ câu hỏi, bạn nói lại nhé 😊"),
  };
}


 
  async chat(uiMessages: UiMsg[], _ctx: { role: "MANAGER" }) {
    return this.route(uiMessages || []);
  }
}
