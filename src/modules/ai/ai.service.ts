// src/modules/ai/ai.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ToolsService } from "./tools.service";
import { RagService } from "../rag/rag.service";
import { LlmGateway } from "./llm.gateway";

type UiMsg = { role: "user" | "assistant"; content: string };
type QuestionKind = "DATA" | "RAG" | "CHAT" | "SQL" | "TIME";
type RagRole = "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER" | "ALL";

const TZ_DEFAULT = process.env.TZ || "Asia/Ho_Chi_Minh";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly tools: ToolsService,
    private readonly rag: RagService,
    private readonly llm: LlmGateway,
  ) {}

  // =============================
  // Detect chat mode bằng prefix
  // =============================
  private detectMode(question: string) {
    if (question.startsWith("/gemini ")) return "gemini";
    if (question.startsWith("/rag ")) return "rag";
    if (question.startsWith("/sql ")) return "sql";
    return "auto";
  }

  // =============================
  // Nhận diện câu hỏi THỜI GIAN
  // =============================
  private isTimeQuestion(raw: string): boolean {
    const q = raw.toLowerCase().normalize("NFC");

    const patterns = [
      /bây giờ mấy giờ/,
      /mấy giờ rồi/,
      /thời gian (bây giờ|hiện tại)/,
      /giờ hiện tại/,
      /giờ bây giờ/,
      /ở hcm (mấy giờ|bây giờ là mấy giờ|giờ mấy giờ)/,
      /hôm nay ngày mấy/,
      /hôm nay là ngày bao nhiêu/,
      /hôm nay là ngày gì/,
      /hôm nay là thứ mấy/,
      /today.*time/,
      /what time is it/,
      /today.*date/,
      /current time/,
      /current date/,
    ];

    return patterns.some((re) => re.test(q));
  }

  // =============================
  // Nhận diện câu hỏi DỮ LIỆU (SQL)
  // =============================
  private looksLikeDataQuestion(raw: string): boolean {
    const q = raw.toLowerCase().normalize("NFC");

    const patterns = [
      /doanh\s*thu/,
      /doanh\s*số/,
      /hóa\s*đơn/,
      /hoá\s*đơn/,
      /đơn\s*hàng/,
      /invoice/,
      /revenue/,
      /sales/,
      /tháng\s*\d{1,2}\s*20\d{2}/,
      /tháng\s*\d{1,2}/,
      /\b20\d{2}\b/,
      /(bao nhiêu|mấy|tổng|đếm)\s+(hóa\s*đơn|hoá\s*đơn|đơn\s*hàng)/,
    ];

    return patterns.some((re) => re.test(q));
  }

  // =============================
  // LLM phân loại câu hỏi
  // =============================
  private async classifyQuestion(question: string): Promise<QuestionKind> {
    const sys = `
Bạn là bộ phân loại câu hỏi cho trợ lý nhà hàng.
Nhiệm vụ: CHỈ trả về đúng MỘT từ trong các nhãn sau (viết hoa, không giải thích thêm):

- "DATA": khi người dùng hỏi về số liệu, thống kê, đếm, doanh thu, số hóa đơn, 
  danh sách dữ liệu trong database (kể cả tháng/năm trong TƯƠNG LAI so với bạn).

- "SQL": khi người dùng muốn xem hoặc viết câu lệnh SQL, debug SQL, hoặc yêu cầu "viết câu SELECT..."...

- "RAG": khi người dùng hỏi về quy trình, nội quy, chính sách, hướng dẫn, SOP, tài liệu txt/md.

- "TIME": khi người dùng hỏi về thời gian/ngày giờ hiện tại.

- "CHAT": các câu hỏi trò chuyện thông thường, giải thích chung, tư vấn,
  không cần truy vấn DB và không nằm trong tài liệu nội bộ.

CHỈ trả về một trong năm chuỗi: DATA, SQL, RAG, TIME, CHAT.
`.trim();

    const user = `Câu hỏi: """${question}"""`;

    try {
      const out = (await this.llm.chat(sys, user, 5_000)).trim().toUpperCase();
      if (out.includes("TIME")) return "TIME";
      if (out.includes("DATA")) return "DATA";
      if (out.includes("SQL")) return "SQL";
      if (out.includes("RAG")) return "RAG";
      if (out.includes("CHAT")) return "CHAT";
    } catch (e) {
      this.logger.warn(
        `[AiService] classifyQuestion error: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
    return "CHAT";
  }

  // =============================
  // Build câu trả lời thời gian hiện tại (HCM)
  // =============================
  private buildNowAnswer(): string {
    const tz = TZ_DEFAULT;
    const now = new Date();

    const dateStr = new Intl.DateTimeFormat("vi-VN", {
      timeZone: tz,
      year: "numeric",
      month: "long",
      day: "2-digit",
      weekday: "long",
    }).format(now);

    const timeStr = new Intl.DateTimeFormat("vi-VN", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(now);

    return `Hiện tại là ${timeStr}, ${dateStr} (múi giờ ${tz}). ⏰`;
  }

  // =============================
  // AUTO MODE
  // =============================
  private async autoRoute(question: string, ragRole: RagRole = "ALL") {
    // 0) TIME bằng regex → trả lời ngay
    if (this.isTimeQuestion(question)) {
      this.logger.log(
        `[AiService] AUTO detect TIME by regex question="${question}"`,
      );
      return { role: "assistant", content: this.buildNowAnswer() };
    }

    // 1) DATA bằng regex → ép DATA luôn
    let kind: QuestionKind;
    if (this.looksLikeDataQuestion(question)) {
      kind = "DATA";
      this.logger.log(
        `[AiService] AUTO force kind=DATA by regex question="${question}"`,
      );
    } else {
      kind = await this.classifyQuestion(question);
      this.logger.log(
        `[AiService] AUTO classify=${kind} question="${question}"`,
      );
    }

    // 2) TIME do LLM detect
    if (kind === "TIME") {
      return { role: "assistant", content: this.buildNowAnswer() };
    }

    // 3) DATA & SQL → SmartSQL
    if (kind === "DATA" || kind === "SQL") {
      try {
        const { sql, rows, explain, sources } =
          await this.tools.runSmartQuery(question);
        return {
          role: "assistant",
          content: explain,
          data: { sql, rows, sources },
        };
      } catch (e: any) {
        this.logger.warn(`[SQL] Lỗi khi chạy SmartSQL: ${e?.message}`);
        return {
          role: "assistant",
          content: "❌ Lỗi khi truy vấn SQL: " + e?.message,
        };
      }
    }

    // 4) RAG → đọc tài liệu (dùng LangChain + role)
    if (kind === "RAG") {
      try {
        const rag = await this.rag.askWithLangChain(question, {
          role: ragRole,
        });
        return {
          role: "assistant",
          content: rag.answer,
          data: { sources: rag.sources },
        };
      } catch (e: any) {
        this.logger.warn(`[RAG] Lỗi RAG: ${e?.message}`);
        return {
          role: "assistant",
          content: "❌ Không đọc được tài liệu nội bộ.",
        };
      }
    }

    // 5) CHAT → Gemini
    const text = await this.llm.chat(
      `
Bạn là trợ lý AI thân thiện cho quản lý nhà hàng.
- Trả lời tiếng Việt tự nhiên, dễ hiểu.
- Dùng emoji nhẹ nhàng nếu phù hợp.
- Nếu câu hỏi mơ hồ, hãy hỏi lại cho rõ.
`.trim(),
      question,
      30_000,
    );

    return {
      role: "assistant",
      content:
        text ||
        "Mình chưa trả lời được câu này, bạn có thể nói rõ hơn không? 😊",
    };
  }

  // =============================
  // MAIN ROUTE
  // =============================
  async route(messages: UiMsg[], ctx: { role: RagRole }) {
    const questionRaw =
      messages.filter((m) => m.role === "user").pop()?.content || "";
    if (!questionRaw) return { role: "assistant", content: "Xin chào 👋" };

    const mode = this.detectMode(questionRaw);
    const question = questionRaw
      .replace(/^\/(gemini|rag|sql)\s+/i, "")
      .trim();

    this.logger.log(
      `[AiService] mode=${mode}, role=${ctx.role}, question="${question}"`,
    );

    // ép /sql → SmartSQL
    if (mode === "sql") {
      try {
        const { sql, rows, explain, sources } =
          await this.tools.runSmartQuery(question);
        return {
          role: "assistant",
          content: explain,
          data: { sql, rows, sources },
        };
      } catch (e: any) {
        return {
          role: "assistant",
          content: "❌ Lỗi SQL: " + e?.message,
        };
      }
    }

    // ép /rag → RAG (LangChain + role)
    if (mode === "rag") {
      const rag = await this.rag.askWithLangChain(question, {
        role: ctx.role ?? "ALL",
      });
      return {
        role: "assistant",
        content: rag.answer,
        data: { sources: rag.sources },
      };
    }

    // ép /gemini → chat thuần
    if (mode === "gemini") {
      const text = await this.llm.chat(
        "Bạn là trợ lý AI thân thiện cho quản lý nhà hàng.",
        question,
        25_000,
      );
      return {
        role: "assistant",
        content:
          text ||
          "Mình chưa trả lời được câu này, bạn có thể nói rõ hơn không? 😊",
      };
    }

    // AUTO
    return this.autoRoute(question, ctx.role ?? "ALL");
  }

  async chat(uiMessages: UiMsg[], ctx: { role: RagRole }) {
    return this.route(uiMessages || [], ctx);
  }
}
