/**
 * Bounded, read-only retrieval loop adapted from Open Dungeon Master (MIT).
 * Upstream: https://github.com/Lebbitheplow/open-game-master
 * MIT-licensed implementation inspected via https://github.com/mfarme/lorekeeper
 *
 * The tools expose only source-grounded D&D 2024/SRD 5.2.1 and Ekdrasil 2.4
 * excerpts. They cannot roll dice, mutate campaign state, or write persistence.
 */
import { selectCanonExcerpts, selectRuleExcerpts } from "./model-routing.ts";

type JsonRecord = Record<string, unknown>;

export const EKDRASIL_READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_dnd_rules",
      description: "Найти точные выдержки из загруженного D&D 2024 / SRD 5.2.1. Используй, если контекста правил недостаточно. Только чтение.",
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
      description: "Найти точные выдержки только из Ekdrasil_Master_Canon_v2.4.md. Старые редакции запрещены. Только чтение.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { query: { type: "string", minLength: 3, maxLength: 180 } },
        required: ["query"],
      },
    },
  },
] as const;

export interface RetrievalSource {
  content: string;
  sourceId: string;
  sha256: string;
}

function queryTerms(query: string): string[] {
  return [...new Set(query.normalize("NFKC").toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2))].slice(0, 24);
}

export function executeEkdrasilReadTool(
  name: string,
  rawArguments: string,
  rules: RetrievalSource,
  canon: RetrievalSource,
): JsonRecord {
  let args: unknown;
  try { args = JSON.parse(rawArguments || "{}"); }
  catch { return { ok: false, error: "Аргументы инструмента должны быть корректным JSON." }; }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "Ожидался объект аргументов." };
  }
  const query = (args as JsonRecord).query;
  if (typeof query !== "string" || query.trim().length < 3 || query.length > 180) {
    return { ok: false, error: "Поле query должно содержать от 3 до 180 символов." };
  }
  const terms = queryTerms(query.trim());
  if (!terms.length) return { ok: false, error: "Запрос не содержит поисковых терминов." };

  if (name === "search_dnd_rules") {
    const excerpts = selectRuleExcerpts(rules.content, terms, 9_000, 3);
    return {
      ok: true,
      source: "D&D 2024 / SRD 5.2.1",
      sourceId: rules.sourceId,
      sha256: rules.sha256,
      excerpts: excerpts.map((item) => ({
        text: item.text,
        lines: `${item.startLine}–${item.endLine}`,
        relevance: item.score,
      })),
      note: excerpts.length
        ? "Только полные выдержки из проверенного источника SRD 5.2.1."
        : "Совпадений в проверенном источнике не найдено. Не выдумывай правило; обозначь UNKNOWN.",
    };
  }

  if (name === "search_ekdrasil_canon") {
    const excerpts = selectCanonExcerpts(canon.content, terms, 9_000, 3);
    return {
      ok: true,
      source: "Ekdrasil_Master_Canon_v2.4.md",
      edition: "2.4",
      sourceId: canon.sourceId,
      sha256: canon.sha256,
      excerpts: excerpts.map((item) => ({
        text: item.text,
        sectionId: item.sectionId,
        headingPath: item.headingPath,
        lines: `${item.startLine}–${item.endLine}`,
        relevance: item.score,
      })),
      note: excerpts.length
        ? "Только полные выдержки из канона 2.4 с происхождением."
        : "Совпадений в каноне 2.4 не найдено. Считай сведения UNKNOWN; старые редакции запрещены.",
    };
  }

  return { ok: false, error: "Инструмент не разрешён. Доступны только поиск правил и канона." };
}

export interface RetrievalLoopResult {
  response: Response;
  payload: unknown;
  toolCalls: number;
  exhausted: boolean;
}

export async function callWithEkdrasilReadTools(options: {
  fetcher: typeof fetch;
  url: string;
  headers: HeadersInit;
  requestBody: JsonRecord;
  enabled: boolean;
  rules: RetrievalSource;
  canon: RetrievalSource;
  maxToolRounds?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
}): Promise<RetrievalLoopResult> {
  const messages = Array.isArray(options.requestBody.messages)
    ? [...options.requestBody.messages] as JsonRecord[]
    : [];
  const maxRounds = Math.max(0, Math.min(options.maxToolRounds ?? 3, 3));
  const maxCalls = Math.max(1, Math.min(options.maxToolCalls ?? 6, 6));
  const deadline = Date.now() + (options.timeoutMs ?? 40_000);

  const send = async (body: JsonRecord): Promise<{ response: Response; payload: unknown }> => {
    const remaining = deadline - Date.now();
    if (remaining <= 1_000) {
      return {
        response: new Response(JSON.stringify({ error: { message: "Game-master tool-loop time budget exhausted." } }), { status: 504 }),
        payload: null,
      };
    }
    const response = await options.fetcher(options.url, {
      method: "POST",
      headers: options.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.min(remaining, 42_000)),
    });
    const payload = await response.clone().json().catch(() => null) as unknown;
    return { response, payload };
  };

  if (!options.enabled) {
    const result = await send(options.requestBody);
    return { ...result, toolCalls: 0, exhausted: false };
  }

  let toolCalls = 0;
  for (let round = 0; ; round += 1) {
    const toolBody: JsonRecord = {
      ...options.requestBody,
      messages,
      tools: EKDRASIL_READ_TOOLS,
      tool_choice: "auto",
    };
    // Tool-capable requests omit structured-output constraints for compatibility
    // with providers that cannot combine strict JSON schema and function calls.
    delete toolBody.response_format;
    delete toolBody.structured_outputs;
    const result = await send(toolBody);
    if (!result.response.ok) return { ...result, toolCalls, exhausted: false };
    if (!result.payload || typeof result.payload !== "object" || Array.isArray(result.payload)) {
      return { ...result, toolCalls, exhausted: false };
    }
    const root = result.payload as JsonRecord;
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as JsonRecord : {};
    const message = choice.message && typeof choice.message === "object" ? choice.message as JsonRecord : {};
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (!calls.length) {
      // Open Dungeon Master's orchestration separates retrieval from final
      // narration. Restore the app's strict turn schema and remove all tools.
      const finalBody: JsonRecord = { ...options.requestBody, messages };
      delete finalBody.tools;
      delete finalBody.tool_choice;
      const finalResult = await send(finalBody);
      return { ...finalResult, toolCalls, exhausted: false };
    }
    if (round >= maxRounds || toolCalls + calls.length > maxCalls) {
      return { ...result, toolCalls, exhausted: true };
    }

    messages.push(message);
    for (const rawCall of calls) {
      const call = rawCall && typeof rawCall === "object" ? rawCall as JsonRecord : {};
      const fn = call.function && typeof call.function === "object" ? call.function as JsonRecord : {};
      const id = typeof call.id === "string" ? call.id : "";
      const name = typeof fn.name === "string" ? fn.name : "";
      const rawArgs = typeof fn.arguments === "string" ? fn.arguments : "{}";
      const toolResult = id
        ? executeEkdrasilReadTool(name, rawArgs, options.rules, options.canon)
        : { ok: false, error: "У вызова инструмента отсутствует идентификатор." };
      messages.push({
        role: "tool",
        tool_call_id: id || "invalid-tool-call",
        content: JSON.stringify(toolResult),
      });
      toolCalls += 1;
    }
  }
}
