import { Injectable, Logger } from "@nestjs/common";
import { ToolsService } from "./tools.service";
import { RagService } from "../rag/rag.service";
import { LlmGateway } from "./llm.gateway";

type UiMsg = { role: "user" | "assistant"; content: string };

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly tools: ToolsService,
    private readonly rag: RagService,
    private readonly llm: LlmGateway,
  ) {}

  // -----------------------------
  // Detect chat mode
  // -----------------------------
  private detectMode(question: string) {
    if (question.startsWith("/gemini ")) return "gemini";
    if (question.startsWith("/rag ")) return "rag";
    if (question.startsWith("/sql ")) return "sql";
    return "auto";
  }
private lastDataContext: null | {
  question: string;
  sql: string;
  rows: any[];
} = null;

  // -----------------------------
  // AUTO MODE (SQL → RAG → Gemini)
  // -----------------------------
  private async autoRoute(question: string) {
    this.logger.log(`[AiService] AUTO mode for question="${question}"`);

    // 1) Smart SQL
    try {
      if (this.tools.isDataQuestion(question)) {
        const { sql, rows, explain, sources } = await this.tools.runSmartQuery(question);
        return { role: "assistant", content: explain, data: { sql, rows, sources } };
      }
    } catch (e) {
      this.logger.warn(`[SmartSQL failed] ${e}`);
    }

    // 2) RAG
    try {
      const ragHits = await this.rag.query(question);
      const threshold = Number(process.env.RAG_SCORE_THRESHOLD || 0.2);

      if (ragHits.length && (ragHits[0].score ?? 0) >= threshold) {
        const rag = await this.rag.ask(question);
        return { role: "assistant", content: rag.answer, data: { sources: rag.sources } };
      }
    } catch (err) {
      this.logger.warn(`[RAG failed] ${err}`);
    }

    // 3) Gemini fallback
    const text = await this.llm.chat(
      `Bạn là trợ lý AI thân thiện. Trả lời tự nhiên.`,
      question,
      25000,
    );

    return { role: "assistant", content: text };
  }

  // -----------------------------
  // MAIN ROUTE
  // -----------------------------
  async route(messages: UiMsg[]) {
    const questionRaw =
      messages.filter((m) => m.role === "user").pop()?.content || "";
    if (!questionRaw) return { role: "assistant", content: "Xin chào 👋" };

    const mode = this.detectMode(questionRaw);
    const question = questionRaw.replace(/^\/(gemini|rag|sql)\s+/i, "").trim();

    this.logger.log(`[AiService] mode=${mode}, question="${question}"`);

    // --- MODE 1: SQL ---
    if (mode === "sql") {
      try {
        const { sql, rows, explain, sources } = await this.tools.runSmartQuery(question);
        return { role: "assistant", content: explain, data: { sql, rows, sources } };
      } catch (e) {
        return { role: "assistant", content: "❌ Lỗi SQL: " + e.message };
      }
    }

    // --- MODE 2: RAG ---
    if (mode === "rag") {
      const rag = await this.rag.ask(question);
      return { role: "assistant", content: rag.answer, data: { sources: rag.sources } };
    }

    // --- MODE 3: GEMINI ---
    if (mode === "gemini") {
      const text = await this.llm.chat(
        "Bạn là trợ lý AI thân thiện.",
        question,
        25000,
      );
      return { role: "assistant", content: text };
    }

    // --- MODE AUTO ---
    return this.autoRoute(question);
  }

  async chat(uiMessages: UiMsg[], _ctx: { role: "MANAGER" }) {
    return this.route(uiMessages || []);
  }
}
