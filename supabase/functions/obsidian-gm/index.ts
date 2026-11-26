import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";
const ROUTERAI_API_KEY = Deno.env.get("ROUTERAI_API_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_MODELS = new Set(["obsidian-free"]);
const ALLOWED_ORIGINS = new Set([
  "https://poip14poip-beep.github.io",
  "https://id-preview--f1a28b3c-1045-4cea-a6be-745d1ef02a64.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
]);

type JsonRecord = Record<string, unknown>;
type ModelAttempt = { id: string; format: "schema" | "json" };
const MODEL_ATTEMPTS: ModelAttempt[] = [
  // DeepSeek V4.1 Flash: economical long-context reasoning model on RouterAI.
  { id: "deepseek/deepseek-v4.1-flash", format: "schema" },
];

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateSchema(value: unknown, schema: JsonRecord): boolean {
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  const type = schema.type;
  if (type === "object") {
    if (!isRecord(value)) return false;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((x): x is string => typeof x === "string") : [];
    if (required.some((key) => !(key in value))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !(key in properties))) return false;
    return Object.entries(properties).every(([key, child]) => !(key in value) || (isRecord(child) && validateSchema(value[key], child)));
  }
  if (type === "array") {
    return Array.isArray(value) && (!isRecord(schema.items) || value.every((item) => validateSchema(item, schema.items as JsonRecord)));
  }
  if (Array.isArray(type)) {
    const allowed = type as unknown[];
    const matches = (candidate: unknown): boolean => {
      if (candidate === "null") return value === null;
      if (candidate === "string") return typeof value === "string";
      if (candidate === "integer") return Number.isInteger(value);
      if (candidate === "number") return typeof value === "number" && Number.isFinite(value);
      if (candidate === "boolean") return typeof value === "boolean";
      if (candidate === "object") return isRecord(value);
      if (candidate === "array") return Array.isArray(value);
      return false;
    };
    return allowed.some(matches);
  }
  if (type === "string") return typeof value === "string";
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (Array.isArray(schema.enum)) return schema.enum.includes(value);
  return true;
}
function outputText(message: JsonRecord): string {
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => isRecord(part) && typeof part.text === "string" ? part.text : "").join("\n").trim();
  }
  return "";
}
function tokens(usage: unknown): { input_tokens?: number; output_tokens?: number } | undefined {
  if (!isRecord(usage)) return undefined;
  const input = Number(usage.prompt_tokens);
  const output = Number(usage.completion_tokens);
  return {
    ...(Number.isFinite(input) ? { input_tokens: input } : {}),
    ...(Number.isFinite(output) ? { output_tokens: output } : {}),
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Only POST is supported." } }, 405, cors);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This app origin is not allowed." } }, 403, cors);

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > 3_500_000) return json({ error: { code: "REQUEST_TOO_LARGE", message: "Request is too large." } }, 413, cors);
  const authorization = req.headers.get("authorization") ?? "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return json({ error: { code: "AUTH_REQUIRED", message: "Sign in to use the game master." } }, 401, cors);
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return json({ error: { code: "SERVER_CONFIGURATION_INCOMPLETE", message: "Supabase server configuration is incomplete." } }, 503, cors);
  }
  const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(tokenMatch[1]);
  if (authError || !authData.user) {
    return json({ error: { code: "INVALID_SESSION", message: "Your session is invalid or expired. Sign in again." } }, 401, cors);
  }
  let rawBody: string;
  try { rawBody = await req.text(); }
  catch { return json({ error: { code: "INVALID_BODY", message: "Could not read request body." } }, 400, cors); }
  if (rawBody.length > 3_500_000) return json({ error: { code: "REQUEST_TOO_LARGE", message: "Request is too large." } }, 413, cors);

  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400, cors); }
  if (isRecord(body) && body.operation === "STORE_GM_SOURCE") {
    const sourceKind = body.sourceKind;
    const title = body.title;
    const content = body.content;
    if (sourceKind !== "OBSIDIAN_MASTER_PROMPT" && sourceKind !== "SRD_5_2_1") {
      return json({ error: { code: "INVALID_GM_SOURCE_KIND", message: "Unsupported master source type." } }, 400, cors);
    }
    if (typeof title !== "string" || !title.trim() || typeof content !== "string" ||
        !content.trim() || content.length > 2_500_000) {
      return json({ error: { code: "INVALID_GM_SOURCE", message: "Файл пуст или превышает допустимый размер 2,5 млн символов." } }, 400, cors);
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: { code: "PRIVATE_VAULT_NOT_CONFIGURED", message: "Не настроен серверный доступ к закрытому хранилищу мастера." } }, 503, cors);
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
    const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await serviceClient.rpc("obsidian_api_upsert_gm_source", {
      p_actor: authData.user.id,
      p_source_kind: sourceKind,
      p_title: title.trim(),
      p_content: content,
      p_sha256: sha256,
    });
    if (error) return json({ error: { code: "PRIVATE_VAULT_WRITE_FAILED", message: "Не удалось сохранить закрытый документ мастера." } }, 500, cors);
    return json({ stored: true, source: data }, 200, cors);
  }

  if (!ROUTERAI_API_KEY) {
    return json({ error: {
      code: "ROUTERAI_SECRET_MISSING",
      message: "Не настроен RouterAI. Добавь ROUTERAI_API_KEY в Supabase → Edge Functions → Secrets.",
    } }, 503, cors);
  }

  if (!isRecord(body) ||
      typeof body.model !== "string" || !ALLOWED_MODELS.has(body.model) ||
      typeof body.instructions !== "string" || body.instructions.length < 1 || body.instructions.length > 250_000 ||
      typeof body.input !== "string" || body.input.length < 1 || body.input.length > 700_000 ||
      !isRecord(body.text) || !isRecord(body.text.format) ||
      body.text.format.type !== "json_schema" ||
      body.text.format.name !== "obsidian_game_turn" ||
      body.text.format.strict !== true ||
      !isRecord(body.text.format.schema)) {
    return json({ error: { code: "INVALID_REQUEST", message: "The game-master request has an invalid shape or unsupported model." } }, 400, cors);
  }

  const schema = body.text.format.schema;
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: { code: "PRIVATE_VAULT_NOT_CONFIGURED", message: "Не настроено закрытое хранилище документов мастера." } }, 503, cors);
  }
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: privateSources, error: privateSourcesError } = await serviceClient.rpc(
    "obsidian_api_get_gm_sources", { p_actor: authData.user.id },
  );
  if (privateSourcesError || !isRecord(privateSources) ||
      !isRecord(privateSources.OBSIDIAN_MASTER_PROMPT) ||
      typeof privateSources.OBSIDIAN_MASTER_PROMPT.content !== "string") {
    return json({ error: {
      code: "OBSIDIAN_MASTER_PROMPT_NOT_CONFIGURED",
      message: "В закрытом хранилище мастера ещё не загружен полный документ ОБСИДИАН 4.1. Игровой запрос не отправлен.",
    } }, 503, cors);
  }
  const masterPrompt = privateSources.OBSIDIAN_MASTER_PROMPT.content;
  const rulesDoc = isRecord(privateSources.SRD_5_2_1) && typeof privateSources.SRD_5_2_1.content === "string"
    ? privateSources.SRD_5_2_1.content : "";
  const ruleParagraphs = rulesDoc.split(/\\n\\s*\\n/g).map((part) => part.trim()).filter((part) => part.length > 80);
  let actionText = body.input.toLowerCase();
  try {
    const parsedInput = JSON.parse(body.input);
    if (isRecord(parsedInput) && typeof parsedInput.action === "string") actionText += " " + parsedInput.action.toLowerCase();
  } catch { /* input remains available for matching */ }
  const ruleTerms = [...new Set(actionText.split(/[^a-z0-9а-яё]+/i).filter((term) => term.length > 3))];
  const selectedRules = ruleParagraphs
    .map((paragraph) => ({ paragraph, score: ruleTerms.reduce((sum, term) => sum + (paragraph.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item) => item.paragraph);
  const rulesContext = selectedRules.length
    ? "ПОДТВЕРЖДЁННЫЕ ФРАГМЕНТЫ SRD 5.2.1:\\n" + selectedRules.join("\\n\\n")
    : "SRD 5.2.1: релевантные фрагменты не найдены; не выдумывай точные механические детали, если они не подтверждены.";
  const serverInstructions = [
    masterPrompt,
    "=== СЛУЖЕБНЫЕ ИНСТРУКЦИИ ПРИЛОЖЕНИЯ ===",
    body.instructions,
    "=== ЗАКРЫТЫЙ КОНТЕКСТ ПРАВИЛ ===",
    rulesContext,
  ].join("\\n\\n");
  const messages = [
    { role: "system", content: serverInstructions },
    { role: "user", content: body.input },
  ];
  const failures: string[] = [];
  for (const attempt of MODEL_ATTEMPTS) {
    try {
      const responseFormat = attempt.format === "schema"
        ? { type: "json_schema", json_schema: { name: "obsidian_game_turn", strict: true, schema } }
        : { type: "json_object" };
      const upstream = await fetch("https://routerai.ru/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ROUTERAI_API_KEY}`,
          "HTTP-Referer": "https://poip14poip-beep.github.io/obsidian-dnd-master./",
          "X-Title": "Obsidian D&D Master",
        },
        body: JSON.stringify({
          model: attempt.id,
          messages,
          response_format: responseFormat,
          structured_outputs: true,
          temperature: 0.25,
          max_tokens: 8192,
        }),
        signal: AbortSignal.timeout(55_000),
      });
      const raw = await upstream.text();
      let payload: unknown;
      try { payload = JSON.parse(raw); }
      catch { failures.push(`${attempt.id}: unreadable response`); continue; }

      if (!upstream.ok) {
        const apiError = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
        const message = typeof apiError.message === "string" ? apiError.message.slice(0, 220) : `HTTP ${upstream.status}`;
        if (upstream.status === 429) {
          const retryAfter = upstream.headers.get("retry-after");
          return json({
            error: {
              code: "ROUTERAI_RATE_LIMITED",
              message: "RouterAI временно ограничил частоту запросов. Ничего не сохранено." +
                (retryAfter ? ` Повтори через ${retryAfter} сек.` : " Повтори немного позже."),
            },
          }, 429, cors);
        }
        if (upstream.status === 401 || upstream.status === 402 || upstream.status === 403) {
          return json({ error: {
            code: upstream.status === 402 ? "ROUTERAI_BALANCE_OR_PAYMENT_REQUIRED" : "ROUTERAI_AUTH_ERROR",
            message: upstream.status === 402
              ? "RouterAI сообщил о недостаточном балансе или платёжном ограничении. Проверь баланс."
              : "RouterAI не принял ключ или запрос. Проверь ROUTERAI_API_KEY и настройки аккаунта.",
          } }, upstream.status, cors);
        }
        failures.push(`${attempt.id}: ${upstream.status} ${message}`);
        continue;
      }

      const root = isRecord(payload) ? payload : {};
      const choices = Array.isArray(root.choices) ? root.choices : [];
      const choice = isRecord(choices[0]) ? choices[0] : {};
      const message = isRecord(choice.message) ? choice.message : {};
      const content = outputText(message);
      if (!content || choice.finish_reason === "length") {
        failures.push(`${attempt.id}: empty or truncated output`);
        continue;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(content); }
      catch { failures.push(`${attempt.id}: invalid JSON`); continue; }
      if (!validateSchema(parsed, schema)) {
        failures.push(`${attempt.id}: output does not match the required turn schema`);
        continue;
      }
      return json({
        output_text: content,
        model: attempt.id,
        usage: tokens(root.usage),
      }, 200, cors);
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      failures.push(`${attempt.id}: ${timedOut ? "timeout" : "network error"}`);
    }
  }

  return json({
    error: {
      code: "ROUTERAI_MODEL_UNAVAILABLE",
      message: "Модель RouterAI недоступна или не вернула корректный ход. Ничего не сохранено. " + failures.join("; ").slice(0, 700),
    },
  }, 503, cors);
});
