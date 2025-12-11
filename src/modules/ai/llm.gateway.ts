// src/modules/ai/llm.gateway.ts
import { Injectable, Logger } from "@nestjs/common";

const fetchFn: typeof fetch = globalThis.fetch;

type GenPart = { text?: string };
type GenCandidate = { content?: { parts?: GenPart[] } };
type GenResp = {
  candidates?: GenCandidate[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; code?: number; status?: string };
};

type SingleEmb = { embedding?: { values?: number[] }; error?: any };
type BatchEmb = { embeddings?: { values?: number[] }[]; error?: any };

function isAbort(e: any) {
  return e?.name === "AbortError" || /aborted/i.test(String(e?.message));
}

@Injectable()
export class LlmGateway {
  private readonly logger = new Logger(LlmGateway.name);

  // ─────────────────────────────────────────────────────────────
  // GEMINI (Google AI Studio)
  // ─────────────────────────────────────────────────────────────

  private get geminiKey(): string {
    return process.env.GEMINI_API_KEY || "";
  }

  private ensureGeminiKey() {
    if (!this.geminiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
  }

  // generic call cho generateContent
  private async callGeminiGenerateContent(
    model: string,
    body: any,
    timeoutMs: number,
  ): Promise<GenResp> {
    this.ensureGeminiKey();

    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${this.geminiKey}`;

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      const json = (await res.json().catch(() => ({}))) as GenResp;

      if (!res.ok) {
        this.logger.warn(
          `[Gemini] HTTP ${res.status} generateContent: ${JSON.stringify(
            json,
          ).slice(0, 400)}`,
        );
        throw new Error(
          json?.error?.message ||
            `Gemini HTTP ${res.status} when calling generateContent`,
        );
      }

      return json;
    } finally {
      clearTimeout(to);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CHAT = Gemini
  // ─────────────────────────────────────────────────────────────
  private async geminiChat(
    system: string,
    user: string,
    timeoutMs = 25_000,
  ): Promise<string> {
    const model = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";

    const mergedPrompt = system
      ? `System:\n${system}\n\nUser:\n${user}`
      : user;

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: mergedPrompt }],
        },
      ],
    };

    try {
      const j = await this.callGeminiGenerateContent(model, body, timeoutMs);

      const text =
        (j.candidates ?? [])
          .flatMap((c) => c.content?.parts ?? [])
          .map((p) => p.text ?? "")
          .join("")
          .trim() || "";

      if (!text && j.promptFeedback?.blockReason) {
        throw new Error(
          `Gemini blocked: ${j.promptFeedback.blockReason}`,
        );
      }

      return text;
    } catch (e: any) {
      if (isAbort(e)) {
        this.logger.warn(
          `[Gemini] chat timeout ${timeoutMs}ms: ${e?.message || e}`,
        );
      } else {
        this.logger.warn(`[Gemini] chat error: ${e?.message || e}`);
      }
      throw e;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // EMBEDDINGS = Gemini text-embedding-004
  // ─────────────────────────────────────────────────────────────
  private async geminiEmbed(
    input: string | string[],
  ): Promise<number[] | number[][]> {
    this.ensureGeminiKey();

    const model = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";
    const isBatch = Array.isArray(input);

    if (isBatch) {
      const texts = input as string[];

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${this.geminiKey}`;

      const r = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((t) => ({
            content: { parts: [{ text: String(t) }] },
          })),
        }),
      });

      const j = (await r.json().catch(() => ({}))) as BatchEmb;

      if (!r.ok || j?.error) {
        this.logger.error(
          `[Gemini] batchEmbed error: HTTP ${r.status} body=${JSON.stringify(
            j,
          ).slice(0, 400)}`,
        );
        throw new Error(
          j?.error?.message ||
            `Gemini batchEmbed HTTP ${r.status}`,
        );
      }

      const vecs = (j.embeddings ?? []).map((e) => e.values ?? []);
      if (!vecs.length || !vecs[0].length) {
        this.logger.error(
          `[Gemini] batchEmbed returned empty: ${JSON.stringify(j).slice(
            0,
            400,
          )}`,
        );
        throw new Error("Gemini batch embeddings empty.");
      }

      return vecs;
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${this.geminiKey}`;

      const r = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: String(input) }] },
        }),
      });

      const j = (await r.json().catch(() => ({}))) as SingleEmb;

      if (!r.ok || (j as any)?.error) {
        this.logger.error(
          `[Gemini] embedContent error: HTTP ${r.status} body=${JSON.stringify(
            j,
          ).slice(0, 400)}`,
        );
        throw new Error(
          (j as any)?.error?.message ||
            `Gemini embedContent HTTP ${r.status}`,
        );
      }

      const vec = j.embedding?.values ?? [];
      if (!vec.length) {
        this.logger.error(
          `[Gemini] embedContent returned empty: ${JSON.stringify(j).slice(
            0,
            400,
          )}`,
        );
        throw new Error("Gemini single embedding empty.");
      }

      return vec;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: CHAT (KHÔNG fallback OpenAI)
  // ─────────────────────────────────────────────────────────────
  async chat(
    system: string,
    user: string,
    timeoutMs = 25_000,
  ): Promise<string> {
    return this.geminiChat(system, user, timeoutMs);
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: EMBEDDINGS (KHÔNG fallback OpenAI)
  // ─────────────────────────────────────────────────────────────
  async embed(input: string | string[]): Promise<number[] | number[][]> {
    return this.geminiEmbed(input);
  }
}
