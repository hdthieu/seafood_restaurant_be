// src/modules/ai/ai.service.ts
import { Injectable } from "@nestjs/common";
import { ToolsService, GetSalesSummaryArgs } from "./tools.service";
import { ollamaChat } from "../../lib/ollma";

type UiMsg = { role: "user" | "assistant"; content: string };
function isUiMsg(m: any): m is UiMsg {
  return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
}

@Injectable()
export class AiService {
  constructor(private readonly tools: ToolsService) {}

  private todayRange() {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end   = new Date(now); end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  private async explainNatural(kind: string, data: any) {
    const sys = "Bạn là trợ lý vận hành nhà hàng. Trả lời gọn, đúng số liệu. Định dạng tiền 1.234.000 đ.";
    const usr = `Tóm tắt dữ liệu (${kind}):\n${JSON.stringify(data).slice(0, 6000)}\n- Viết 3–5 câu, nêu chỉ số chính và khuyến nghị.`;
    const reply = await ollamaChat(
      [{ role: "system", content: sys }, { role: "user", content: usr }],
      process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b"
    );
    return reply?.trim() || "Không có dữ liệu.";
  }

  /** Router: DB Q&A / Sales / SOP & general chat bằng Ollama */
  private async route(cleaned: UiMsg[]) {
    const { from, to } = this.todayRange();
    const last = cleaned.at(-1)?.content || "";

    const askSales = /(doanh thu|revenue|hôm nay|hôm qua|7 ngày|hóa đơn)/i.test(last);
    const askData =
      /(bao nhiêu|mấy|số lượng|tổng|đếm|count|best.?selling|bán.*chạy|phổ biến|tôm|shrimp|prawn)/i.test(last) ||
      /(món|món ăn|bàn|khách hàng|hóa đơn|đơn hàng|payments?|nhân\s*viên|employee|staff|nguyên\s*liệu|ingredient)/i.test(last);

    if (askSales) {
      const input: GetSalesSummaryArgs = {
        from,
        to,
        by: /ngày|7 ngày|week/i.test(last) ? "day" : "hour",
      };
      const data = await this.tools.getSalesSummary(input);
      const text = await this.explainNatural("sales", {
        by: data.by, kpi: data.kpi, series: data.series?.slice(0, 12),
      });
      return { role: "assistant", content: text, data };
    }

    if (askData) {
      try {
        const { sql, rows, explain } = await this.tools.runSmartQuery(last);
        return {
          role: "assistant",
          content: `${explain}\n\n_SQL chạy:_\n${"```sql"}\n${sql}\n${"```"}`,
          data: { sql, rows },
        };
      } catch (e: any) {
        return { role: "assistant", content: `Không chạy được truy vấn: ${e?.message || e}` };
      }
    }

    // Chat AI bình thường
    const reply = await ollamaChat(
      [{ role: "system", content: "Bạn là trợ lý thân thiện, trả lời ngắn gọn và hữu ích." },
       ...cleaned.map((m) => ({ role: m.role, content: m.content }))],
      process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b"
    );
    return { role: "assistant", content: reply?.trim() || "Mình chưa rõ câu hỏi." };
  }

  async chat(uiMessages: UiMsg[], _ctx: { role: "MANAGER" }) {
    const cleaned = (uiMessages || []).filter(isUiMsg);
    return this.route(cleaned);
  }
}
