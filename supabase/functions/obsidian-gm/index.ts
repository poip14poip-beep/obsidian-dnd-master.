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
  "http://localhost:3000",
  "http://localhost:5173",
]);

type JsonRecord = Record<string, unknown>;
type ModelAttempt = { id: string; format: "schema" | "json" };
const MODEL_ATTEMPTS: ModelAttempt[] = [
  // Cost-efficient default for ordinary narration and low-risk turns.
  { id: "deepseek/deepseek-v4.1-flash", format: "schema" },
  // Stronger narrative/reasoning route for character dossiers and consequential turns.
  { id: "anthropic/claude-sonnet-5.5", format: "schema" },
  // Independent provider fallback if both primary routes are unavailable.
  { id: "google/gemini-4-argon", format: "schema" },
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
const biographySchema: JsonRecord = {
  type: "object", additionalProperties: false,
  properties: {
    ageYears: { type: ["integer", "null"] },
    ageCertainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
    genderPresentation: { type: "string" },
    appearance: { type: "string" },
    appearanceDetails: {
      type: "object", additionalProperties: false,
      properties: {
        height: { type: "string" }, build: { type: "string" }, skin: { type: "string" },
        hair: { type: "string" }, eyes: { type: "string" }, face: { type: "string" },
        clothing: { type: "string" }, footwear: { type: "string" }, accessories: { type: "string" },
        distinctiveFeatures: { type: "string" }, firstImpression: { type: "string" }
      },
      required: ["height","build","skin","hair","eyes","face","clothing","footwear","accessories","distinctiveFeatures","firstImpression"]
    },
    birthplace: { type: "string" },
    birthplaceSource: { type: "string" },
    family: { type: "string" },
    upbringing: { type: "string" },
    lifeEvents: { type: "array", items: { type: "string" } },
    personalityTraits: { type: "array", items: { type: "string" } },
    ideal: { type: "string" },
    bond: { type: "string" },
    flaw: { type: "string" },
    motivation: { type: "string" },
    preCampaignDesire: { type: "string" },
    biography: { type: "string" },
    skillOrigins: { type: "array", items: { type: "string" } },
    weaponBackground: { type: "string" },
    equipmentBackground: { type: "string" },
    canonBasis: { type: "array", items: { type: "string" } },
    inventedDetailsNotice: { type: "string" },
  },
  required: ["ageYears","ageCertainty","genderPresentation","appearance","appearanceDetails","birthplace","birthplaceSource","family","upbringing","lifeEvents","personalityTraits","ideal","bond","flaw","motivation","preCampaignDesire","biography","skillOrigins","weaponBackground","equipmentBackground","canonBasis","inventedDetailsNotice"],
};

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
    if (sourceKind !== "OBSIDIAN_MASTER_PROMPT" && sourceKind !== "SRD_5_2_1" && sourceKind !== "EKDRASIL_WORLD_BIBLE" && sourceKind !== "CHARACTER_GENERATION_GUIDE") {
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
    const { data, error } = await serviceClient.rpc("obsidian_api_upsert_gm_base", {
      p_source_kind: sourceKind,
      p_title: title.trim(),
      p_content: content,
      p_sha256: sha256,
    });
    if (error) return json({ error: { code: "PRIVATE_VAULT_WRITE_FAILED", message: "Не удалось сохранить закрытый документ мастера." } }, 500, cors);
    return json({ stored: true, source: data }, 200, cors);
  }

  const isBiographyRequest = isRecord(body) && body.operation === "GENERATE_CHARACTER_BIOGRAPHY";
  const requestBody: JsonRecord = isRecord(body) ? body : {};
  if (!ROUTERAI_API_KEY) {
    return json({ error: {
      code: "ROUTERAI_SECRET_MISSING",
      message: "Не настроен RouterAI. Добавь ROUTERAI_API_KEY в Supabase → Edge Functions → Secrets.",
    } }, 503, cors);
  }

  const commonRequestValid = typeof requestBody.model === "string" && ALLOWED_MODELS.has(requestBody.model) &&
    typeof requestBody.instructions === "string" && requestBody.instructions.length >= 1 && requestBody.instructions.length <= 250_000 &&
    typeof requestBody.input === "string" && requestBody.input.length >= 1 && requestBody.input.length <= 700_000;
  const turnRequestValid = isRecord(requestBody.text) && isRecord(requestBody.text.format) &&
    requestBody.text.format.type === "json_schema" && requestBody.text.format.name === "obsidian_game_turn" &&
    requestBody.text.format.strict === true && isRecord(requestBody.text.format.schema);
  if (!commonRequestValid || (!isBiographyRequest && !turnRequestValid)) {
    return json({ error: { code: "INVALID_REQUEST", message: "The game-master request has an invalid shape or unsupported model." } }, 400, cors);
  }
  const inputText = requestBody.input as string;
  const instructionText = requestBody.instructions as string;
  const schema: JsonRecord = isBiographyRequest ? biographySchema : (((requestBody.text as JsonRecord).format as JsonRecord).schema as JsonRecord);
  const schemaName = isBiographyRequest ? "obsidian_character_biography" : "obsidian_game_turn";
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: { code: "PRIVATE_VAULT_NOT_CONFIGURED", message: "Не настроено закрытое хранилище документов мастера." } }, 503, cors);
  }
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: privateSources, error: privateSourcesError } = await serviceClient.rpc(
    "obsidian_api_get_gm_base",
  );
  if (privateSourcesError || !isRecord(privateSources) ||
      !isRecord(privateSources.OBSIDIAN_MASTER_PROMPT) ||
      typeof privateSources.OBSIDIAN_MASTER_PROMPT.content !== "string") {
    return json({ error: {
      code: "OBSIDIAN_MASTER_PROMPT_NOT_CONFIGURED",
      message: "В постоянную базу мастера ещё не добавлен ОБСИДИАН 4.1. Игровой запрос не отправлен.",
    } }, 503, cors);
  }
  const masterPrompt = privateSources.OBSIDIAN_MASTER_PROMPT.content;
  const rulesDoc = isRecord(privateSources.SRD_5_2_1) && typeof privateSources.SRD_5_2_1.content === "string"
    ? privateSources.SRD_5_2_1.content : "";
  const ruleParagraphs = rulesDoc.split(String.fromCharCode(10) + String.fromCharCode(10)).map((part) => part.trim()).filter((part) => part.length > 80);
  const canonDoc = isRecord(privateSources.EKDRASIL_WORLD_BIBLE) && typeof privateSources.EKDRASIL_WORLD_BIBLE.content === "string"
    ? privateSources.EKDRASIL_WORLD_BIBLE.content : "";
  const characterGuide = isRecord(privateSources.CHARACTER_GENERATION_GUIDE) && typeof privateSources.CHARACTER_GENERATION_GUIDE.content === "string"
    ? privateSources.CHARACTER_GENERATION_GUIDE.content : "";
  if (!canonDoc.trim()) {
    return json({ error: {
      code: "EKDRASIL_CANON_NOT_CONFIGURED",
      message: "В постоянную базу мастера ещё не добавлена хроника Экдрасиля. Игровой запрос не отправлен.",
    } }, 503, cors);
  }
  const canonParagraphs = canonDoc.split(String.fromCharCode(10) + String.fromCharCode(10)).map((part) => part.trim()).filter((part) => part.length > 60);

  if (!rulesDoc.trim()) {
    return json({ error: {
      code: "SRD_SOURCE_NOT_CONFIGURED",
      message: "В постоянную базу мастера ещё не добавлен SRD 5.2.1. Игровой запрос не отправлен.",
    } }, 503, cors);
  }
  let actionText = inputText.toLowerCase();
  try {
    const parsedInput = JSON.parse(inputText);
    if (isRecord(parsedInput) && typeof parsedInput.action === "string") actionText = parsedInput.action.toLowerCase();
  } catch { /* use raw input for matching */ }
  if (isBiographyRequest) actionText = inputText.toLowerCase();
  const mappedTerms: string[] = [];
  if (/атак|удар|оруж|бой|инициатив/.test(actionText)) mappedTerms.push("attack", "combat", "weapon", "initiative", "attack roll");
  if (/урон|поврежден/.test(actionText)) mappedTerms.push("damage", "damage roll", "resistance", "vulnerability");
  if (/спасброс|сопротив/.test(actionText)) mappedTerms.push("saving throw", "saving throws");
  if (/провер|навык|характеристик/.test(actionText)) mappedTerms.push("ability check", "d20 test", "skill");
  if (/скрыт|незамет|прят|крад/.test(actionText)) mappedTerms.push("stealth", "hide", "invisible");
  if (/восприят|замет|осмотр|вниман/.test(actionText)) mappedTerms.push("perception", "search", "study");
  if (/заклин|маг|колдов|концентрац/.test(actionText)) mappedTerms.push("spellcasting", "spell", "concentration");
  if (/движ|перемещ|скорост|прыж|лаз|плав/.test(actionText)) mappedTerms.push("movement", "speed", "difficult terrain", "jump", "climb");
  if (/состояни|слеп|испуг|отрав|яд/.test(actionText)) mappedTerms.push("condition", "conditions", "poisoned", "frightened", "blinded");
  if (/отдых|восстанов/.test(actionText)) mappedTerms.push("long rest", "short rest", "resting");
  if (/перегруз|вес|грузоподъем/.test(actionText)) mappedTerms.push("carrying capacity", "encumbrance", "push", "drag", "lift");
  if (/смерт|умира|без созн/.test(actionText)) mappedTerms.push("death saving throw", "dying", "stabilize");
  if (/класс|боец|воин|особенност/.test(actionText)) mappedTerms.push("fighter", "character classes", "class features");
  const ruleTerms = [...new Set([...actionText.split(/[^a-z0-9а-яё]+/i), ...mappedTerms].filter((term) => term.length > 3))];
  const selectedRules = ruleParagraphs
    .map((paragraph) => ({ paragraph, score: ruleTerms.reduce((sum, term) => sum + (paragraph.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((item) => item.paragraph);
  const rulesContext = selectedRules.length
    ? "ПОДТВЕРЖДЁННЫЕ ФРАГМЕНТЫ SRD 5.2.1:" + String.fromCharCode(10) + selectedRules.join(String.fromCharCode(10) + String.fromCharCode(10))
    : "SRD 5.2.1: релевантные фрагменты не найдены; не выдумывай точные механические детали, если они не подтверждены.";
  const canonSearchParts = [actionText];
  try {
    const parsed = JSON.parse(inputText);
    if (isRecord(parsed)) {
      const campaign = isRecord(parsed.campaign) ? parsed.campaign : {};
      const character = isRecord(parsed.playerCharacterState) ? parsed.playerCharacterState : {};
      canonSearchParts.push(
        String(campaign.startLocationName ?? ""),
        String(campaign.currentInGameDate ?? ""),
        String(campaign.startNarrative ?? ""),
        String(character.speciesAndClass ?? ""),
      );
      for (const key of ["knownLocations", "knownNpcs", "knownFactions"] as const) {
        const records = parsed[key];
        if (Array.isArray(records)) {
          for (const item of records) if (isRecord(item)) canonSearchParts.push(String(item.name ?? ""));
        }
      }
    }
  } catch { /* action text remains the safe minimum query */ }
  const canonTerms = [...new Set([...canonSearchParts.join(" ").toLowerCase().split(/[^a-z0-9а-яё]+/i), ...mappedTerms].filter((term) => term.length > 3))];
  const selectedCanon = canonParagraphs
    .map((paragraph) => {
      const haystack = paragraph.toLowerCase();
      const score = canonTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      const headingBoost = /^#{1,4}\s/m.test(paragraph) ? 1 : 0;
      return { paragraph, score: score + headingBoost };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 18)
    .map((item) => item.paragraph);
  const canonContext = selectedCanon.length
    ? "ПОСТОЯННЫЙ КАНОН ЭКДРАСИЛЯ (фрагменты из мировой хроники):" + String.fromCharCode(10) + selectedCanon.join(String.fromCharCode(10) + String.fromCharCode(10))
    : "Хроника Экдрасиля подключена, но по формулировке действия релевантные фрагменты не найдены. Не выдумывай сведения о мире; UNKNOWN при отсутствии подтверждения.";

  const isCharacterGeneration = isBiographyRequest || /созда(й|ть|ние).{0,40}персонаж|генерац.{0,30}персонаж|биографи.{0,30}персонаж|character generation/i.test(actionText);
  const highImpactTurn = isBiographyRequest || /атак|бой|урон|ранен|смерт|спасброс|заклин|ресурс|инвентар|деньг|фракц|npc|переговор|обман|скрыт|задани|квест|проклят|мутац/i.test(actionText);
  const orderedModelAttempts = highImpactTurn
    ? [MODEL_ATTEMPTS[1]!, MODEL_ATTEMPTS[0]!, MODEL_ATTEMPTS[2]!]
    : MODEL_ATTEMPTS;
  const characterGuideContext = isCharacterGeneration
    ? (characterGuide.trim()
      ? "=== РЕФЕРЕНС МЕТОДИКИ ГЕНЕРАЦИИ ПЕРСОНАЖЕЙ (НЕ КАНОН И НЕ ПРАВИЛА) ===" + String.fromCharCode(10) + characterGuide
      : "РЕФЕРЕНС МЕТОДИКИ ГЕНЕРАЦИИ ПЕРСОНАЖЕЙ НЕ ЗАГРУЖЕН. Не выдумывай его содержание; используй только основной промт, подтверждённый канон и SRD.")
    : "";
  const serverInstructions = [
    masterPrompt,
    characterGuideContext,
    "=== СЛУЖЕБНЫЕ ИНСТРУКЦИИ ПРИЛОЖЕНИЯ ===",
    instructionText,
    "=== ЗАКРЫТЫЙ КОНТЕКСТ ПРАВИЛ ===",
    rulesContext,
    "=== ПОСТОЯННАЯ БИБЛИЯ МИРА ===",
    isBiographyRequest ? canonContext : canonContext,
    ...(isBiographyRequest ? [
      "РЕЖИМ ГЕНЕРАЦИИ БИОГРАФИИ: не изменяй механику, имя, народ, класс, предысторию, место рождения, источник места рождения или canonBasis, переданные в JSON. Возвращай те же birthplace, birthplaceSource и canonBasis дословно.",
      "Создай индивидуальное полное досье на русском языке. Обязательно заполни appearanceDetails как отдельную подробную таблицу внешности: рост, телосложение, кожа, волосы, глаза, лицо, одежда с конкретными предметами и состоянием, обувь, аксессуары, отличительные особенности и первое впечатление. Значения должны быть конкретными, согласованными с народом, возрастом, профессией, климатом и достатком; не используй общие заглушки. Поле appearance оставь кратким сводным описанием. Обязательно заполни preCampaignDesire: конкретное личное желание персонажа в Экдрасиле непосредственно перед началом кампании, не глобальную судьбу и не навязанный квест. Помимо биографии заполни skillOrigins: по одному содержательному объяснению происхождения каждого уже имеющегося навыка из skillBonuses входного персонажа; не добавляй и не удаляй навыки. Заполни weaponBackground: объясни, откуда персонаж получил именно переданное оружие, как научился им пользоваться и почему носит его; не меняй название оружия, атаку, урон или mastery. Заполни equipmentBackground: объясни происхождение и практическую роль каждого предмета переданного inventory; не добавляй, не удаляй и не меняй предметы, количество или свойства. Свяжи эти детали с предысторией, профессией, жизненными событиями и местом происхождения. Не используй готовые универсальные клише. Не делай персонажа избранным или участником глобальных событий без основания. Не приписывай ему секретные знания, членство во фракциях или встречи с NPC.",
      "В Экдрасиле нет свободной повседневной магии. Не добавляй заклинания, заговоры, магические навыки, магическую защиту, сопротивление магии или сверхъестественные расовые черты без конкретного подтверждённого источника в каноне и явного основания в профиле персонажа. Не переноси автоматически Fey Ancestry, магические заговоры вроде Prestidigitation и другие магические черты SRD в Экдрасиль. Мутация и проклятие различны и редки; не добавляй их без явного разрешения во входных параметрах. Обычный персонаж не должен иметь мутацию или проклятие по умолчанию.",
      "Возраст, семья, воспитание и события биографии — индивидуально сгенерированные детали, а не канон. Если неизвестно — UNKNOWN. Не добавляй механические эффекты.",
      "Не создавай новые города, страны, организации, исторические события или NPC. Сведения о происхождении должны соответствовать переданным подтверждённым данным.",
    ] : []),
  ].join(String.fromCharCode(10) + String.fromCharCode(10));
  const messages = [
    { role: "system", content: serverInstructions },
    { role: "user", content: inputText },
  ];
  const failures: string[] = [];
  for (const attempt of orderedModelAttempts) {
    try {
      const responseFormat = attempt.format === "schema"
        ? { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } }
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
