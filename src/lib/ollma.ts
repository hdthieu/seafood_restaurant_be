// src/lib/ollma.ts
// Helper thuần Ollama qua REST API (không phụ thuộc node-fetch)

//
// ====== Cấu hình & danh sách model mặc định ======
//
const BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

// Một số lib Ollama đọc OLLAMA_HOST → set luôn cho chắc
// @ts-ignore
process.env.OLLAMA_HOST = BASE_URL;

const DEFAULT_CHAT_CANDIDATES = [
  process.env.OLLAMA_CHAT_MODEL,     // ưu tiên ENV nếu có
  "llama3.1:8b",
  "llama3:8b",
  "qwen2.5:7b-instruct",
  "mistral:7b-instruct",
].filter(Boolean) as string[];

const DEFAULT_EMB_CANDIDATES = [
  process.env.OLLAMA_EMB_MODEL,
  "nomic-embed-text",
  "all-minilm:33m",
].filter(Boolean) as string[];

// Message type cho chat
export type OllamaMsg = {
  role: "system" | "user" | "assistant";
  content: string;
};

//
// ====== HTTP helper dùng fetch built-in của Node (undici) ======
//

type JSONInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string; // LUÔN truyền string nếu có body
};

async function http(path: string, init?: JSONInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: init?.body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama ${path} HTTP ${res.status}: ${text}`);
  }
  return res;
}

//
// ====== Quản lý model (liệt kê / pull / đảm bảo tồn tại) ======
//

async function listModels(): Promise<Set<string>> {
  const res = await http("/api/tags");
  const j = (await res.json()) as { models?: Array<{ name?: string }> };
  const set = new Set<string>();
  for (const m of j.models || []) {
    if (m?.name) set.add(String(m.name));
  }
  return set;
}

async function pullModel(name: string) {
  // REST API trả stream nhiều chunk → đọc hết để chờ hoàn tất
  const res = await fetch(`${BASE_URL}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Ollama pull ${name} HTTP ${res.status}: ${t}`);
  }
  const reader = res.body?.getReader();
  if (reader) {
    // nuốt stream (không log chi tiết để gọn console)
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  }
}

async function ensureModel(candidates: string[]): Promise<string> {
  const installed = await listModels();

  // 1) nếu có sẵn một trong candidates → dùng luôn
  for (const c of candidates) {
    if (installed.has(c)) return c;
  }

  // 2) chưa có → thử pull candidate đầu
  const first = candidates[0];
  if (!first) throw new Error("No model candidate provided.");
  try {
    // eslint-disable-next-line no-console
    console.log(`[Ollama] Pulling model '${first}' ...`);
    await pullModel(first);
    return first;
  } catch {
    // 3) pull thất bại → fallback: tìm bất kỳ model đã cài có thể chat/emb
    const any = [...installed].find((n) =>
      /llama|qwen|mistral|phi|gemma|deepseek|mixtral|command|granite/i.test(n)
    );
    if (any) return any;
    throw new Error(`Model '${first}' not found and no alternative installed.`);
  }
}

//
// ====== Public APIs: Embeddings + Chat ======
//

/**
 * Lấy embedding. `input` có thể là string hoặc mảng string.
 * Trả về:
 *  - string  → number[]
 *  - string[]→ number[][]
 */
export async function ollamaEmbed(
  input: string | string[],
  modelCandidates: string[] = DEFAULT_EMB_CANDIDATES
): Promise<number[] | number[][]> {
  const model = await ensureModel(modelCandidates);

  const res = await http("/api/embeddings", {
    method: "POST",
    body: JSON.stringify({ model, input }),
  });

  // Ollama REST có thể trả:
  //  - { embedding: number[] }
  //  - { embeddings: number[][] }  (tùy bản / wrapper)
  const j = (await res.json()) as
    | { embedding: number[] }
    | { embeddings: number[][] }
    | any;

  if (Array.isArray((j as any).embedding)) {
    return j.embedding as number[];
  }
  if (Array.isArray((j as any).embeddings)) {
    return j.embeddings as number[][];
  }
  throw new Error("Unexpected embeddings response from Ollama.");
}

/**
 * Chat với model Ollama. Có auto-pull model nếu thiếu.
 * Trả về content của assistant.
 */
export async function ollamaChat(
  messages: OllamaMsg[],
  modelCandidates: string[] | string = DEFAULT_CHAT_CANDIDATES
): Promise<string> {
  const list = Array.isArray(modelCandidates) ? modelCandidates : [modelCandidates];
  const model = await ensureModel(list);

  const res = await http("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      model,
      stream: false,
      messages,
    }),
  });

  const j = (await res.json()) as {
    message?: { role?: string; content?: string };
    done?: boolean;
  };

  return j?.message?.content ?? "";
}
