// src/modules/ai/ai.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ToolsService } from "./tools.service";
import { RagService } from "../rag/rag.service";
import { LlmGateway } from "./llm.gateway";

type UiMsg = { role: "user" | "assistant"; content: string };
type QuestionKind = "DATA" | "RAG" | "CHAT" | "SQL" | "TIME";
type RagRole = "KITCHEN" | "WAITER" | "CASHIER" | "MANAGER" | "ALL";
const ROLE_SUGGESTIONS: Record<RagRole | "GENERAL", string[]> = {
  WAITER: [
    "Quy trình đón khách",
    "Quy trình ghi order cho đúng",
    "Quy trình phục vụ món ăn cho khách",
    "Xử lý khi khách phàn nàn về món ăn",
    "Làm sao upsell món hiệu quả?",
    "Quy trình dọn bàn sau khi khách dùng xong",
    "Xử lý tình huống khách say, làm đổ món, trẻ em chạy nhảy"
  ],
  CASHIER: [
    "Quy trình thanh toán tiền mặt",
    "Quy trình thanh toán thẻ hoặc QR",
    "Quy trình hủy hoá đơn trên hệ thống",
    "Quy trình xuất hoá đơn VAT",
    "Quy trình hoàn tiền (refund) cho khách",
    "Cách áp dụng khuyến mãi và voucher",
    "Đối soát tiền mặt cuối ca"
  ],
  KITCHEN: [
    "Quy trình nhận order từ hệ thống bếp",
    "Quy trình sơ chế nguyên liệu",
    "Quy trình chế biến món ăn đúng công thức",
    "Quy trình ra món (PASS) cho phục vụ",
    "Quy trình báo hết món",
    "Quy trình xử lý món lỗi / làm lại",
    "Quy trình vệ sinh bếp và đóng ca"
  ],
  MANAGER: [
    "Checklist đầu ca cho quản lý",
    "Checklist cuối ca cho quản lý",
    "Quy trình xử lý khiếu nại khách hàng mức độ cao",
    "Quy trình chấm công và tính lương nhân viên",
    "Quy trình quản lý kho và kiểm kê tồn",
    "Báo cáo doanh thu ngày cần xem những gì",
    "Phân tích doanh thu tháng và top món bán chạy",
    "Quy trình đào tạo nhân viên mới"
  ],
  ALL: [
    "Nội quy làm việc chung của nhà hàng",
    "Quy định an toàn vệ sinh thực phẩm",
    "Quy định PCCC trong nhà hàng",
    "Chính sách thưởng phạt nhân viên",
    "Quy định nghỉ phép, tăng ca, đổi ca",
    "Quy trình ứng lương và hoàn ứng"
  ],
  GENERAL: [
    "Tôi là nhân viên phục vụ, tôi cần biết những quy trình gì?",
    "Tôi là thu ngân, tôi cần xem các quy định nào?",
    "Tôi là bếp, các SOP trong bếp gồm những gì?",
    "Tôi là quản lý, tôi cần xem checklist vận hành",
    "Cho tôi xem các quy định chung của nhà hàng"
  ],
};

function detectRoleFromIntro(
  raw: string,
): { role: RagRole | "GENERAL"; label: string } | null {
  const q = raw.toLowerCase().normalize("NFC").trim();

  // Chỉ coi là "intro" nếu câu bắt đầu bằng mấy cụm này
  const introMatch = q.match(/^(tôi|em|mình|anh|chị)\s+là\s+(.+)/);
  const isNewStaff =
    q.includes("mới vào làm") ||
    q.includes("nhân viên mới") ||
    q.includes("hỗ trợ tôi") ||
    q.includes("ho tro toi") ||
    q.includes("giúp tôi") ||
    q.includes("giup toi");

  // Trường hợp nhân viên mới hỏi chung chung
  if (!introMatch) {
    if (isNewStaff) {
      return { role: "GENERAL", label: "nhân viên mới" };
    }
    // ⚠️ Không tự detect theo từ khoá “quản lý / phục vụ / thu ngân / bếp” nữa
    // để các câu hỏi kiểu “quy tắc chung cho quản lý” đi qua pipeline bình thường.
    return null;
  }

  // phần sau "tôi là ...": vd "nhân viên phục vụ", "quản lý", "bên thu ngân"
  const rest = introMatch[2]; // đã là lowercase

  if (rest.includes("phục vụ") || rest.includes("phuc vu") || rest.includes("waiter")) {
    return { role: "WAITER", label: "nhân viên phục vụ" };
  }
  if (rest.includes("thu ngân") || rest.includes("thu ngan") || rest.includes("cashier")) {
    return { role: "CASHIER", label: "thu ngân" };
  }
  if (rest.includes("bếp") || rest.includes("bep") || rest.includes("kitchen")) {
    return { role: "KITCHEN", label: "bộ phận bếp" };
  }
  if (rest.includes("quản lý") || rest.includes("quan ly") || rest.includes("manager")) {
    return { role: "MANAGER", label: "quản lý" };
  }

  // Trường hợp user tự xưng nhưng nói kiểu chung chung: “tôi là nhân viên mới”
  if (rest.includes("nhân viên mới") || rest.includes("nhan vien moi")) {
    return { role: "GENERAL", label: "nhân viên mới" };
  }

  return null;
}

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

       // Nếu người dùng tự giới thiệu vai trò → trả về gợi ý luôn, không cần LLM
    const intro = detectRoleFromIntro(question);
    if (intro) {
      const suggestions = ROLE_SUGGESTIONS[intro.role] ?? [];
      return {
        role: "assistant",
        content:
          `Chào bạn, mình hiểu bạn đang ở vị trí **${intro.label}**.\n\n` +
          `Bạn có thể hỏi mình về các chủ đề sau (bấm chọn hoặc gõ lại câu hỏi):`,
        suggestions,
      };
    }

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
