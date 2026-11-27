/**
 * Read-only retrieval tools adapted from Open Game Master (MIT).
 * Upstream orchestration reference: https://github.com/Lebbitheplow/open-game-master
 * MIT-licensed fork used during audit: https://github.com/mfarme/lorekeeper
 *
 * These tools only retrieve bounded excerpts. They cannot mutate campaign,
 * character, NPC, inventory, dice, or persistence state.
 */
type JsonRecord = Record<string, unknown>;
export type CanonParagraph = { paragraph: string; haystack: string };

export const EKDRASIL_READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_dnd_rules",
      description: "Найти точные выдержки из загруженного D&D 2024 / SRD 5.2.1. Используй, когда текущего контекста правил недостаточно. Только чтение.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { query: { type: "string", minLength: 3, maxLength: 180 } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_ekdrasil_canon",
      description: "Найти точные выдержки из единственного канона Ekdrasil_Master_Canon_v2.4.md. Не ищи факты в старых редакциях. Только чтение.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { query: { type: "string", minLength: 3, maxLength: 180 } },
        required: ["query"],
      },
    },
  },
] as const;

function termsOf(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2))].slice(0, 18);
}

function ranked<T extends { haystack: string }>(items: T[], query: string): T[] {
  const terms = termsOf(query);
  if (!terms.length) return [];
  return items
    .map((item) => ({ item, score: terms.reduce((score, term) => score + (item.haystack.includes(term) ? 1 : 0), 0) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.item);
}

export function executeEkdrasilReadTool(
  name: string,
  rawArguments: string,
  ruleParagraphs: string[],
  canonParagraphs: CanonParagraph[],
): JsonRecord {
  let args: unknown;
  try { args = JSON.parse(rawArguments || "{}"); } catch { return { ok: false, error: "Аргументы инструмента должны быть JSON." }; }
  if (!args || typeof args !== "object" || Array.isArray(args)) return { ok: false, error: "Ожидался объект аргументов." };
  const query = (args as JsonRecord).query;
  if (typeof query !== "string" || query.trim().length < 3 || query.length > 180) {
    return { ok: false, error: "Поле query должно содержать от 3 до 180 символов." };
  }
  const normalized = query.trim();
  if (name === "search_dnd_rules") {
    const matches = ranked(ruleParagraphs.map((paragraph) => ({ paragraph, haystack: paragraph.toLocaleLowerCase() })), normalized);
    return {
      ok: true,
      source: "D&D 2024 / SRD 5.2.1",
      excerpts: matches.map(({ paragraph }) => paragraph.slice(0, 1800)),
      note: matches.length ? "Выдержки взяты из загруженного источника правил." : "В загруженном источнике совпадений не найдено; не выдумывай правило.",
    };
  }
  if (name === "search_ekdrasil_canon") {
    const matches = ranked(canonParagraphs, normalized);
    return {
      ok: true,
      source: "Ekdrasil_Master_Canon_v2.4.md",
      edition: "2.4",
      excerpts: matches.map(({ paragraph }) => paragraph.slice(0, 2200)),
      note: matches.length ? "Выдержки взяты только из подтверждённой редакции 2.4." : "В каноне 2.4 совпадений не найдено. Считай вопрос UNKNOWN; не используй старые редакции.",
    };
  }
  return { ok: false, error: "Инструмент не разрешён. Доступны только поиск правил и канона." };
}

export async function callWithEkdrasilReadTools(options: {
  fetcher: typeof fetch;
  url: string;
  headers: HeadersInit;
  requestBody: JsonRecord;
  enabled: boolean;
  ruleParagraphs: string[];
  canonParagraphs: CanonParagraph[];
  maxToolRounds?: number;
  timeoutMs?: number;
}): Promise<{ response: Response; payload: unknown; toolCalls: number; exhausted: boolean }> {
  const messages = Array.isArray(options.requestBody.messages)
    ? [...options.requestBody.messages] as JsonRecord[]
    : [];
  const maxRounds = Math.max(0, Math.min(options.maxToolRounds ?? 3, 3));
  const deadline = Date.now() + (options.timeoutMs ?? 82_000);
  let toolCalls = 0;
  for (let round = 0; ; round += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 1_000) {
      return { response: new Response(JSON.stringify({ error: { message: "Tool loop time budget exhausted." } }), { status: 504 }), payload: null, toolCalls, exhausted: true };
    }
    const body: JsonRecord = { ...options.requestBody, messages };
    if (options.enabled) {
      delete body.response_format;
      delete body.structured_outputs;
      body.tools = EKDRASIL_READ_TOOLS;
      body.tool_choice = "auto";
    }
    const response = await options.fetcher(options.url, {
      method: "POST",
      headers: options.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(remainingMs, 82_000)),
    });
    const payload = await response.clone().json().catch(() => null) as unknown;
    if (!response.ok || !options.enabled) return { response, payload, toolCalls, exhausted: false };
    const root = payload && typeof payload === "object" ? payload as JsonRecord : {};
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as JsonRecord : {};
    const message = choice.message && typeof choice.message === "object" ? choice.message as JsonRecord : {};
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) {
      // Retrieval and the final structured game turn are separate model phases.
      // Tool-capable requests omit response_format for OpenAI-compatible
      // providers; once the model has no more tools to call, make one final
      // tool-free request with the original strict JSON schema restored.
      const finalBody: JsonRecord = { ...options.requestBody, messages };
      delete finalBody.tools;
      delete finalBody.tool_choice;
      if (options.requestBody.response_format !== undefined) {
        finalBody.response_format = options.requestBody.response_format;
      }
      if (options.requestBody.structured_outputs !== undefined) {
        finalBody.structured_outputs = options.requestBody.structured_outputs;
      }
      const finalRemainingMs = deadline - Date.now();
      if (finalRemainingMs <= 1_000) {
        return { response: new Response(JSON.stringify({ error: { message: "Final structured response time budget exhausted." } }), { status: 504 }), payload: null, toolCalls, exhausted: true };
      }
      const finalResponse = await options.fetcher(options.url, {
        method: "POST",
        headers: options.headers,
        body: JSON.stringify(finalBody),
        signal: AbortSignal.timeout(Math.min(finalRemainingMs, 82_000)),
      });
      const finalPayload = await finalResponse.clone().json().catch(() => null) as unknown;
      return { response: finalResponse, payload: finalPayload, toolCalls, exhausted: false };
    }
    if (round >= maxRounds) return { response, payload, toolCalls, exhausted: true };
    if (toolCalls + calls.length > 6) return { response, payload, toolCalls, exhausted: true };
    messages.push(message);
    for (const rawCall of calls) {
      const call = rawCall && typeof rawCall === "object" ? rawCall as JsonRecord : {};
      const fn = call.function && typeof call.function === "object" ? call.function as JsonRecord : {};
      const id = typeof call.id === "string" ? call.id : "";
      const name = typeof fn.name === "string" ? fn.name : "";
      const rawArgs = typeof fn.arguments === "string" ? fn.arguments : "{}";
      const result = id
        ? executeEkdrasilReadTool(name, rawArgs, options.ruleParagraphs, options.canonParagraphs)
        : { ok: false, error: "У вызова инструмента отсутствует идентификатор." };
      messages.push({
        role: "tool",
        tool_call_id: id || "invalid-tool-call",
        content: JSON.stringify(result),
      });
      toolCalls += 1;
    }
  }
}
