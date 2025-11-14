// src/lib/ollma.ts
const BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
// @ts-ignore
process.env.OLLAMA_HOST = BASE_URL;

const DEFAULT_CHAT_CANDIDATES = [
  process.env.OLLAMA_CHAT_MODEL,
  "llama3.1:8b",
  "qwen2.5:7b-instruct",
  "mistral:7b-instruct",
].filter(Boolean) as string[];

const DEFAULT_EMB_CANDIDATES = [
  process.env.OLLAMA_EMB_MODEL,
  "nomic-embed-text",
  "all-minilm:33m",
].filter(Boolean) as string[];

export type OllamaMsg = { role: "system" | "user" | "assistant"; content: string };

async function http(path: string, init?: { method?: string; headers?: any; body?: string }) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    body: init?.body,
  });
  if (!res.ok) throw new Error(`Ollama ${path} HTTP ${res.status}: ${await res.text().catch(()=>"")}`);
  return res;
}

async function listModels(): Promise<Set<string>> {
  const res = await http("/api/tags");
  const j = (await res.json()) as { models?: { name?: string }[] };
  const s = new Set<string>();
  for (const m of j.models || []) if (m?.name) s.add(String(m.name));
  return s;
}

async function pullModel(name: string) {
  const res = await fetch(`${BASE_URL}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Ollama pull ${name} HTTP ${res.status}: ${await res.text().catch(()=>"")}`);
  const r: any = (res as any).body?.getReader?.();
  if (r) while (true) { const { done } = await r.read(); if (done) break; }
}

async function ensureModel(candidates: string[]): Promise<string> {
  const installed = await listModels();
  for (const c of candidates) if (installed.has(c)) return c;
  const first = candidates[0];
  if (!first) throw new Error("No model candidate");
  try { console.log(`[Ollama] Pulling '${first}' ...`); await pullModel(first); return first; }
  catch {
    const any = [...installed].find(n => /llama|qwen|mistral|phi|gemma|deepseek|mixtral|command|granite/i.test(n));
    if (any) return any;
    throw new Error(`Model '${first}' not found and no alternative installed.`);
  }
}

export async function ollamaEmbed(input: string | string[], cand = DEFAULT_EMB_CANDIDATES) {
  const model = await ensureModel(cand);
  const res = await http("/api/embeddings", { method: "POST", body: JSON.stringify({ model, input }) });
  const j: any = await res.json();
  if (Array.isArray(j?.embedding)) return j.embedding;
  if (Array.isArray(j?.embeddings)) return j.embeddings;
  if (Array.isArray(j?.data?.[0]?.embedding)) return j.data.map((d: any) => d.embedding);
  throw new Error("Unexpected embeddings response from Ollama.");
}

export async function ollamaChat(messages: OllamaMsg[], cand: string[] | string = DEFAULT_CHAT_CANDIDATES) {
  const list = Array.isArray(cand) ? cand : [cand];
  const model = await ensureModel(list);
  const res = await http("/api/chat", { method: "POST", body: JSON.stringify({ model, stream: false, messages }) });
  const j = (await res.json()) as { message?: { content?: string } };
  return j?.message?.content ?? "";
}
