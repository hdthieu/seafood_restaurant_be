import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
const fetchFn: typeof fetch = globalThis.fetch;
type GenPart = { text?: string };
type GenCandidate = { content?: { parts?: GenPart[] } };
type GenResp = { candidates?: GenCandidate[]; promptFeedback?: { blockReason?: string } };
type GeminiModelInfo = {
  name?: string;
  // cả 4 biến thể tên field:
  generation_methods?: string[];
  supported_generation_methods?: string[];
  supportedGenerationMethods?: string[];
  generationMethods?: string[];
};
  function isAbort(e: any) {
  return e?.name === "AbortError" || /aborted/i.test(String(e?.message));
}
@Injectable()
export class LlmGateway {
  private provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

 private buildDesiredCandidates(): string[] {
    const primary = (process.env.GEMINI_CHAT_MODEL || "gemini-1.5-pro-latest").trim();
    const backups = (process.env.GEMINI_CHAT_BACKUPS || "gemini-1.5-flash-latest,gemini-1.5-flash-8b-latest")
      .split(",").map(s => s.trim()).filter(Boolean);

    const addLatest = (m: string) => (m.endsWith("-latest") ? m : `${m}-latest`);
    const seeds = [primary, ...backups];

    // luôn thêm biến thể -latest để tránh 404
    const plusLatest = seeds.flatMap(m => (m.endsWith("-latest") ? [m] : [m, addLatest(m)]));

    return Array.from(new Set(plusLatest));
  }

 // llm.gateway.ts



private async listGeminiModels(apiVersion: "v1" | "v1beta", apiKey: string): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${apiKey}`;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) return []; // đừng gãy
  const j = (await r.json()) as { models?: GeminiModelInfo[] };

  const out: string[] = [];
  for (const m of (j.models ?? [])) {
    const methods =
      m.generation_methods ??
      m.supported_generation_methods ??
      m.supportedGenerationMethods ??
      m.generationMethods ??
      [];
    const ok = Array.isArray(methods) && methods.some(x => /generatecontent/i.test(String(x)));
    if (!ok) continue;

    const short = (m.name || "").replace(/^models\//, "");
    if (short) out.push(short);
  }
  return out;
}




private async tryGeminiOnce(
  apiVersion: "v1" | "v1beta",
  model: string,
  apiKey: string,
  body: any,
  signal?: AbortSignal
) {
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
  const r = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    const err = new Error(`Gemini HTTP ${r.status} (${apiVersion}/${model}): ${txt}`);
    (err as any)._status = r.status;
    throw err;
  }
  const j = await r.json();
  const text = (j?.candidates ?? [])
    .flatMap((c: any) => c?.content?.parts ?? [])
    .map((p: any) => p?.text ?? "")
    .join("")
    .trim();
  if (!text && j?.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked (${apiVersion}/${model}): ${j.promptFeedback.blockReason}`);
  }
  return text || "";
}


  // -- CHAT ------------------------------------------------------------------

 async chat(system: string, user: string, timeoutMs = 25000): Promise<string> {
  // Nếu dùng Gemini
  if (this.provider === "google" || this.provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY!;
    const candidates = this.buildDesiredCandidates();

  const mergedPrompt =
  system ? `System:\n${system}\n\nUser:\n${user}` : user;

const body = {
  contents: [
    {
      role: "user",
      parts: [{ text: mergedPrompt }],
    },
  ],
};



    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      // lấy danh sách model
      let availV1: string[] = [];
      let availBeta: string[] = [];
      try { availV1 = await this.listGeminiModels("v1", apiKey); } catch {}
      try { availBeta = await this.listGeminiModels("v1beta", apiKey); } catch {}

      const plan: Array<{ ver: "v1" | "v1beta"; list: string[] }> = [
        { ver: "v1",     list: availV1.length ? candidates.filter(c => availV1.includes(c)) : candidates },
        { ver: "v1beta", list: availBeta.length ? candidates.filter(c => availBeta.includes(c)) : candidates },
      ];

      let lastErr: any = null;

      for (const step of plan) {
        for (const model of step.list) {
          try {
            const text = await this.tryGeminiOnce(step.ver, model, apiKey, body, ctrl.signal);
            return text || "";
          } catch (e: any) {
            if (isAbort(e)) {
              lastErr = new Error(`Gemini timeout ${timeoutMs}ms at ${step.ver}/${model}`);
              continue;
            }
            if ((e as any)?._status === 404) { lastErr = e; continue; }
            lastErr = e;
            continue;
          }
        }
      }

      throw new Error(
        `No Gemini model succeeded. lastErr=${lastErr?.message || lastErr}`
      );
    } finally {
      clearTimeout(to);
    }
  }

  // Fallback OpenAI
  const resp = await this.openai.chat.completions.create(
    {
      model: process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    { timeout: timeoutMs }
  );
  return resp.choices?.[0]?.message?.content?.trim() || "";
}


  /** Luôn trả number[] hoặc number[][] (batch) */
 // LlmGateway.embed — bản đã sửa, gọn & đúng kiểu trả về của Gemini
async embed(input: string | string[]): Promise<number[] | number[][]> {
  if ((this.provider === "google") || (this.provider === "gemini")) {
    const apiKey = process.env.GEMINI_API_KEY!;
    const model  = process.env.OPENAI_EMBED_MODE || "text-embedding-004";
    const isBatch = Array.isArray(input);

    // Kiểu trả về an toàn cho TS
    type Emb = { values?: number[] };
    type SingleResp = { embedding?: Emb };
    type BatchResp  = { embeddings?: Emb[] };

    if (isBatch) {
      const requests = (input as string[]).map(t => ({ content: { parts: [{ text: String(t) }] } }));
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      });
      const j = (await r.json()) as BatchResp;
      const vecs = (j.embeddings ?? []).map(e => e.values ?? []);
      if (!vecs.length || !vecs[0].length) throw new Error("Gemini batch embeddings empty.");
      return vecs; // number[][]
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { parts: [{ text: String(input) }] } }),
      });
      const j = (await r.json()) as SingleResp;
      const vec = j.embedding?.values ?? [];
      if (!vec.length) throw new Error("Gemini single embedding empty.");
      return vec; // number[]
    }
  }

  // OpenAI fallback (không đổi)
  const model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
  const arr = Array.isArray(input) ? input : [input];
  const r = await this.openai.embeddings.create({ model, input: arr });
  const vecs = r.data.map(d => d.embedding);
  return Array.isArray(input) ? vecs : vecs[0];
}

}
