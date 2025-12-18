import { Injectable, Logger } from "@nestjs/common";

const fetchFn: typeof fetch = globalThis.fetch;

/* ===================== Types ===================== */
type GenPart = { text?: string };
type GenCandidate = { content?: { parts?: GenPart[] } };
type GenResp = {
  candidates?: GenCandidate[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; code?: number; status?: string };
};

type SingleEmb = { embedding?: { values?: number[] }; error?: any };
type BatchEmb = { embeddings?: { values?: number[] }[]; error?: any };

/* ===================== Utils ===================== */
function isAbort(e: any) {
  return e?.name === "AbortError" || /aborted/i.test(String(e?.message));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// parse "Please retry in 24.596s"
function parseRetryAfterMs(msg: string): number | null {
  const m = msg.match(/retry in\s+([0-9.]+)s/i);
  if (m?.[1]) {
    const sec = Number(m[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000);
  }
  return null;
}

function isRetryableGemini(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();

  // ❌ KHÔNG retry
  if (
    msg.includes("billing") ||
    msg.includes("check your plan") ||
    msg.includes("exceeded your current quota") ||
    msg.includes("is not found") ||
    msg.includes("not supported") ||
    msg.includes("call listmodels")
  ) return false;

  // ✅ retry được
  return (
    msg.includes("overloaded") ||
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("temporarily") ||
    msg.includes("timeout") ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("retry in")
  );
}

/* ===================== Gateway ===================== */
@Injectable()
export class LlmGateway {
  private readonly logger = new Logger(LlmGateway.name);

  /* ---------------- GEMINI KEY ---------------- */
  private get geminiKey(): string {
    return process.env.GEMINI_API_KEY || "";
  }

  private ensureGeminiKey() {
    if (!this.geminiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
  }

  /* =================================================
   * Gemini: generateContent (CHAT)
   * ================================================= */
  private async callGeminiGenerateContent(
    model: string,
    body: any,
    timeoutMs: number,
  ): Promise<GenResp> {
    this.ensureGeminiKey();

    const normalizedModel = String(model).replace(/^models\//, "");
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${normalizedModel}:generateContent?key=${this.geminiKey}`;

    const maxRetries = Number(process.env.GEMINI_RETRIES || 4);

    let lastErr: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
          const msg =
            json?.error?.message ||
            `Gemini HTTP ${res.status} generateContent`;

          this.logger.warn(
            `[Gemini] HTTP ${res.status} (attempt ${attempt}/${maxRetries}): ${msg}`,
          );

          // 429 → đọc retry-after
          if (res.status === 429) {
            const ra = res.headers.get("retry-after");
            let waitMs: number | null = null;

            if (ra && /^\d+$/.test(ra)) waitMs = Number(ra) * 1000;
            if (!waitMs) waitMs = parseRetryAfterMs(msg);

            const err: any = new Error(msg);
            err.status = 429;
            err.retryAfterMs = waitMs;
            throw err;
          }

          throw new Error(msg);
        }

        return json;
      } catch (e: any) {
        lastErr = e;

        const retryable = isAbort(e) || isRetryableGemini(e);
        if (attempt >= maxRetries || !retryable) throw e;

        const waitMs = e?.retryAfterMs;
        if (waitMs && waitMs > 0) {
          this.logger.warn(`[Gemini] rate-limit → wait ${waitMs}ms`);
          await sleep(waitMs);
        } else {
          const backoff = Math.min(3000, 500 * Math.pow(2, attempt));
          await sleep(backoff + Math.floor(Math.random() * 200));
        }
      } finally {
        clearTimeout(to);
      }
    }

    throw lastErr;
  }

  /* =================================================
   * Gemini CHAT (with model fallback)
   * ================================================= */
  private async geminiChat(
    system: string,
    user: string,
    timeoutMs = 25_000,
  ): Promise<string> {
    const candidates = process.env.GEMINI_CHAT_MODELS
      ? process.env.GEMINI_CHAT_MODELS.split(",").map((s) => s.trim())
      : [
          process.env.GEMINI_CHAT_MODEL || "gemini-robotics-er-1.5-preview",
          "gemini-2.0-flash",
          "gemini-2.0-flash-lite",
          "gemini-1.5-flash",
        ];

    const mergedPrompt = system
      ? `System:\n${system}\n\nUser:\n${user}`
      : user;

    const body = {
      contents: [{ role: "user", parts: [{ text: mergedPrompt }] }],
    };

    let lastErr: any;

    for (const model of candidates) {
      try {
        const j = await this.callGeminiGenerateContent(model, body, timeoutMs);

        const text =
          (j.candidates ?? [])
            .flatMap((c) => c.content?.parts ?? [])
            .map((p) => p.text ?? "")
            .join("")
            .trim() || "";

        if (!text && j.promptFeedback?.blockReason) {
          throw new Error(`Gemini blocked: ${j.promptFeedback.blockReason}`);
        }

        this.logger.log(`[Gemini] success with model: ${model}`);
        return text;
      } catch (e: any) {
        lastErr = e;

        // quota/billing → đừng thử model khác
        if (/quota|billing|check your plan/i.test(String(e?.message))) {
          throw e;
        }

        if (!isAbort(e) && !isRetryableGemini(e)) throw e;

        this.logger.warn(
          `[Gemini] model ${model} failed → try next: ${e?.message}`,
        );
      }
    }

    throw lastErr;
  }

  /* =================================================
   * Gemini EMBEDDINGS
   * ================================================= */
  private async geminiEmbed(
    input: string | string[],
  ): Promise<number[] | number[][]> {
    this.ensureGeminiKey();

    const model = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";
    const normalizedModel = String(model).replace(/^models\//, "");

    // -------- batch --------
    if (Array.isArray(input)) {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${normalizedModel}:batchEmbedContents?key=${this.geminiKey}`;

      const r = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: input.map((t) => ({
            content: { parts: [{ text: String(t) }] },
          })),
        }),
      });

      const j = (await r.json().catch(() => ({}))) as BatchEmb;

      if (!r.ok || j?.error) {
        throw new Error(j?.error?.message || `Gemini batchEmbed HTTP ${r.status}`);
      }

      return (j.embeddings ?? []).map((e) => e.values ?? []);
    }

    // -------- single --------
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${normalizedModel}:embedContent?key=${this.geminiKey}`;

    const r = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: String(input) }] },
      }),
    });

    const j = (await r.json().catch(() => ({}))) as SingleEmb;

    if (!r.ok || j?.error) {
      throw new Error(j?.error?.message || `Gemini embedContent HTTP ${r.status}`);
    }

    return j.embedding?.values ?? [];
  }

  /* ===================== PUBLIC ===================== */
  async chat(system: string, user: string, timeoutMs = 25_000) {
    return this.geminiChat(system, user, timeoutMs);
  }

  async embed(input: string | string[]) {
    return this.geminiEmbed(input);
  }
}
