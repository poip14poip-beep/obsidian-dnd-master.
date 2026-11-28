import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { DEEPSEEK_GAME_TURN_REASONING_EFFORT, GAME_TURN_MAX_OUTPUT_TOKENS, gameTurnAttemptTimeoutMs, measureGameTurnInput, selectCanonExcerpts, selectGameMasterModelOrder, selectRuleExcerpts, validateGameTurnSemantics, validatePendingRollNarration, type GameMasterModelId } from "./model-routing.ts";
import { parseDiceFormula, rollDiceFormula } from "./dice.ts";
import { formatSpecialistAgentContext, runGameTurnAgents } from "./agent-orchestration.ts";
import { callWithEkdrasilReadTools } from "./game-master-retrieval.ts";
import { ENGINE_BOUNDARY_RULES, ENGINE_BOUNDARY_CHECK, checkNarration, buildCorrectionPrompt, type GuardMessage } from "./engine-boundary.ts";

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
  "https://dbchfgkdrqpjspptoezh.supabase.co",
  "http://localhost:3000",
  "http://localhost:5173",
]);

type JsonRecord = Record<string, unknown>;
type ModelAttempt = { id: GameMasterModelId; format: "schema" | "json" };
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
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableSerialize).join(",") + "]";
  if (isRecord(value)) return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableSerialize(value[key])).join(",") + "}";
  return JSON.stringify(value) ?? "undefined";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch { return null; }
}
function diceProofPayload(value: {
  userId: string; formula: string; dice: unknown[]; modifier: number; total: number;
  issuedAt: number; nonce: string;
}): JsonRecord {
  return {
    userId: value.userId, formula: value.formula, dice: value.dice,
    modifier: value.modifier, total: value.total, issuedAt: value.issuedAt, nonce: value.nonce,
  };
}
async function signDiceProof(value: {
  userId: string; formula: string; dice: unknown[]; modifier: number; total: number;
  issuedAt: number; nonce: string;
}): Promise<string> {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server signing key is not configured.");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(stableSerialize(diceProofPayload(value))),
  );
  return bytesToBase64(new Uint8Array(signature));
}
async function verifyDiceProof(value: {
  userId: string; formula: string; dice: unknown[]; modifier: number; total: number;
  issuedAt: number; nonce: string; signature: string;
}): Promise<boolean> {
  if (!SUPABASE_SERVICE_ROLE_KEY || !Number.isInteger(value.issuedAt) ||
      Date.now() - value.issuedAt > 120_000 || value.issuedAt - Date.now() > 15_000 ||
      !value.nonce || value.nonce.length > 80) return false;
  const signature = base64ToBytes(value.signature);
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC", key, signature,
    new TextEncoder().encode(stableSerialize(diceProofPayload(value))),
  );
}

function playerCharacterFromInput(inputText: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(inputText);
    return isRecord(parsed) && isRecord(parsed.playerCharacterState)
      ? parsed.playerCharacterState
      : null;
  } catch {
    return null;
  }
}

function partyNamesFromInput(inputText: string): string[] {
  try {
    const parsed: unknown = JSON.parse(inputText);
    if (!isRecord(parsed)) return [];
    const names: string[] = [];
    const character = isRecord(parsed.playerCharacterState) ? parsed.playerCharacterState : {};
    if (typeof character.name === "string" && character.name.trim()) names.push(character.name.trim());
    const campaign = isRecord(parsed.campaign) ? parsed.campaign : {};
    const party = Array.isArray(campaign.partyMembers) ? campaign.partyMembers : [];
    for (const member of party) {
      if (isRecord(member) && typeof member.name === "string" && member.name.trim()) names.push(member.name.trim());
    }
    return [...new Set(names)];
  } catch {
    return [];
  }
}
const EKDRASIL_CANON_SHA256 = "6a3aaef38a0275c72970af5a78cd3600762761b5dac6337c34dbd8a38b0a2fc4";
function isEkdrasilCanonV24(value: unknown): value is JsonRecord {
  if (!isRecord(value) || typeof value.content !== "string") return false;
  return typeof value.title === "string" && value.title.includes("2.4") &&
    Number(value.version) >= 4 && value.sha256 === EKDRASIL_CANON_SHA256 &&
    value.content.startsWith("# ЭКДРАСИЛЬ") &&
    value.content.includes("Полная каноническая редакция 2.4") &&
    value.content.includes("## 250. Итоговый принцип живого канона") &&
    value.content.includes("КОНЕЦ ПОЛНОЙ КАНОНИЧЕСКОЙ РЕДАКЦИИ 2.4");
}

function compactAuditValue(value: unknown, depth = 0, key = ""): unknown {
  if (typeof value === "string") {
    const limit = key === "sourceText" ? 16_000 : key === "sourceTextTail" ? 10_000 : key === "sourceDossier" ? 5_000 : 1200;
    return value.length > limit ? value.slice(0, limit) + "…[сокращено]" : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth >= 6) return "[вложенные данные сокращены]";
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => compactAuditValue(item, depth + 1));
  if (isRecord(value)) {
    const entries = Object.entries(value).slice(0, 70).map(([childKey, item]) => [childKey, compactAuditValue(item, depth + 1, childKey)]);
    return Object.fromEntries(entries);
  }
  return String(value);
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
    return Array.isArray(value) &&
      (typeof schema.maxItems !== "number" || value.length <= schema.maxItems) &&
      (!isRecord(schema.items) || value.every((item) => validateSchema(item, schema.items as JsonRecord)));
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
    const matched = allowed.some(matches);
    return matched && !(typeof value === "string" && typeof schema.maxLength === "number" && value.length > schema.maxLength);
  }
  if (type === "string") return typeof value === "string" &&
    (typeof schema.maxLength !== "number" || value.length <= schema.maxLength);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (Array.isArray(schema.enum)) return schema.enum.includes(value);
  return true;
}
const GAME_TURN_STRING_LIMITS: Record<string, number> = {
  narration: 900, campaignMemory: 600, sensoryDescription: 1100,
  spatialAccounting: 450, mechanics: 800, consequences: 550,
  resourceAccounting: 450, nextAction: 300, summary: 160,
  worldOutcome: 350, newInGameDate: 120, consequenceText: 350,
  environmentReason: 250, clarificationQuestion: 300,
  weather: 120, lighting: 100, visibility: 100, wind: 100,
  precipitation: 100, ambientSounds: 140, ambientSmells: 140, notes: 260,
  label: 100, formula: 80, result: 100,
  name: 100, role: 150, goals: 220, resources: 180,
  attitudeToPlayer: 160, reason: 220, factSummary: 220,
  acquisitionPath: 150, title: 140, description: 300,
  reward: 160, sourcePath: 160, objectives: 140,
  inventory: 180, recovery: 140, stateNotes: 220,
};

const GAME_TURN_ARRAY_LIMITS: Record<string, number> = {
  rolls: 4, npcChanges: 5, knowledgeAdditions: 3,
  playerKnowledgeAdditions: 3, questChanges: 3, objectives: 4,
  inventory: 5, resources: 8, conditions: 6, stateNotes: 6,
};

function boundGameTurnSchema(schema: JsonRecord): JsonRecord {
  const visit = (node: JsonRecord, key = ""): JsonRecord => {
    const result: JsonRecord = { ...node };
    const type = result.type;
    if (type === "string" || (Array.isArray(type) && type.includes("string"))) {
      const requested = GAME_TURN_STRING_LIMITS[key] ?? 240;
      const existing = Number(result.maxLength);
      result.maxLength = Number.isFinite(existing) && existing > 0
        ? Math.min(existing, requested)
        : requested;
      // A roll is a request for the player to roll, never a result supplied by
      // the model. Enforce this at the provider JSON-schema layer, not only
      // after generation, so numeric/guessed outcomes cannot be emitted.
      if (key === "result") {
        result.enum = ["ОЖИДАЕТСЯ БРОСОК ИГРОКА"];
      }
    }
    if (type === "array") {
      const requested = GAME_TURN_ARRAY_LIMITS[key] ?? 6;
      const existing = Number(result.maxItems);
      result.maxItems = Number.isFinite(existing) && existing > 0
        ? Math.min(existing, requested)
        : requested;
      if (isRecord(result.items)) result.items = visit(result.items, key);
    }
    if (isRecord(result.properties)) {
      result.properties = Object.fromEntries(
        Object.entries(result.properties).map(([childKey, child]) =>
          [childKey, isRecord(child) ? visit(child, childKey) : child]),
      );
    }
    return result;
  };
  return visit(schema);
}

function outputText(message: JsonRecord): string {
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => isRecord(part) && typeof part.text === "string" ? part.text : "").join("\n").trim();
  }
  return "";
}
const identitySchema: JsonRecord = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 2, maxLength: 70 },
    species: { type: "string", enum: ["Human","Elf","Dark Elf","Gnome","Red Dwarf","Half-Elf","Beastfolk"] },
    className: { type: "string", enum: ["Fighter","Rogue","Barbarian"] },
    background: { type: "string", enum: ["Acolyte","Criminal","Sage","Soldier"] },
    birthplace: { type: "string", enum: ["Вальдгард","Элион","Аэлиндор","Кхар-Дорн","Крейнхольм","Тар-Нер","Равенск","Морвейн","Греймарк","Азра-Кал","Рахимар","Ша-Мер","Вальдрум","Скайнхейм","Эйргард","Морнхольд"] },
    ageYears: { type: "integer" },
    genderPresentation: { type: "string", minLength: 2, maxLength: 50 },
    family: { type: "string", minLength: 20, maxLength: 220 },
    upbringing: { type: "string", minLength: 20, maxLength: 220 },
    lifeEvents: { type: "array", minItems: 2, maxItems: 3, items: { type: "string", minLength: 12, maxLength: 180 } },
    personalityTraits: { type: "array", minItems: 2, maxItems: 3, items: { type: "string", minLength: 3, maxLength: 70 } },
    ideal: { type: "string", minLength: 8, maxLength: 140 },
    bond: { type: "string", minLength: 8, maxLength: 140 },
    flaw: { type: "string", minLength: 8, maxLength: 140 },
    motivation: { type: "string", minLength: 15, maxLength: 180 },
    preCampaignDesire: { type: "string", minLength: 15, maxLength: 180 }
  },
  required: ["name","species","className","background","birthplace","ageYears","genderPresentation","family","upbringing","lifeEvents","personalityTraits","ideal","bond","flaw","motivation","preCampaignDesire"]
};
const appearanceSchema: JsonRecord = {
  type: "object", additionalProperties: false,
  properties: {
    appearance: { type: "string" },
    appearanceDetails: { type: "object", additionalProperties: false, properties: {
      height:{type:"string"},build:{type:"string"},skin:{type:"string"},hair:{type:"string"},eyes:{type:"string"},face:{type:"string"},
      clothing:{type:"string"},footwear:{type:"string"},accessories:{type:"string"},distinctiveFeatures:{type:"string"},firstImpression:{type:"string"}
    }, required:["height","build","skin","hair","eyes","face","clothing","footwear","accessories","distinctiveFeatures","firstImpression"] }
  }, required:["appearance","appearanceDetails"]
};
const storySchema: JsonRecord = {
  type:"object",additionalProperties:false,
  properties:{
    biography:{type:"string"},birthplaceSource:{type:"string"},canonBasis:{type:"array",items:{type:"string"}},
    inventedDetailsNotice:{type:"string"}
  },required:["biography","birthplaceSource","canonBasis","inventedDetailsNotice"]
};
const originsSchema: JsonRecord = {
  type:"object",additionalProperties:false,
  properties:{
    skillOrigins:{type:"array",items:{type:"string"}},
    weaponBackground:{type:"string"},equipmentBackground:{type:"string"}
  },required:["skillOrigins","weaponBackground","equipmentBackground"]
};
const auditItem = { type: "string", maxLength: 140 };
const auditList = { type: "array", items: auditItem, maxItems: 2 };
const compatibilitySchema: JsonRecord = {
  type: "object", additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["COMPATIBLE", "COMPATIBLE_WITH_NOTES", "INCOMPATIBLE", "INSUFFICIENT_DATA"] },
    summary: { type: "string", maxLength: 260 },
    supportedFacts: auditList,
    conflicts: auditList,
    unknowns: auditList,
    requiredChanges: auditList
  },
  required: ["status", "summary", "supportedFacts", "conflicts", "unknowns", "requiredChanges"]
};
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

// The random-character operation returns the complete dossier in one response.
// This avoids a second browser-to-edge request after identity selection.
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
    console.error("[obsidian-gm] auth rejected", authError?.message ?? "user missing");
    return json({ error: { code: "INVALID_SESSION", message: "Your session is invalid or expired. Sign in again." } }, 401, cors);
  }
  console.log("[obsidian-gm] authenticated request", { userId: authData.user.id });
  let rawBody: string;
  try { rawBody = await req.text(); }
  catch { return json({ error: { code: "INVALID_BODY", message: "Could not read request body." } }, 400, cors); }
  if (rawBody.length > 3_500_000) return json({ error: { code: "REQUEST_TOO_LARGE", message: "Request is too large." } }, 413, cors);

  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400, cors); }

  // Dice are rolled by the authenticated server, never guessed by a language model
  // or generated in the player's browser.
  if (isRecord(body) && body.operation === "ROLL_DICE") {
    if (typeof body.formula !== "string" || !parseDiceFormula(body.formula)) {
      return json({ error: { code: "INVALID_DICE_FORMULA", message: "Формула броска не поддерживается." } }, 400, cors);
    }
    try {
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        return json({ error: { code: "DICE_SIGNING_NOT_CONFIGURED", message: "Серверная подпись результатов бросков не настроена." } }, 503, cors);
      }
      const rolled = rollDiceFormula(body.formula);
      const proof = {
        userId: authData.user.id,
        issuedAt: Date.now(),
        nonce: crypto.randomUUID(),
      };
      const signature = await signDiceProof({
        ...proof, formula: body.formula, dice: rolled.dice,
        modifier: rolled.modifier, total: rolled.total,
      });
      return json({ formula: body.formula, ...rolled, proof: { ...proof, signature } }, 200, cors);
    } catch {
      return json({ error: { code: "DICE_ROLL_FAILED", message: "Сервер не смог выполнить бросок. Результат не подменён." } }, 500, cors);
    }
  }

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

  if (isRecord(body) && body.operation === "CHECK_SERVER_READINESS") {
    if (!SUPABASE_SERVICE_ROLE_KEY) return json({ ready: false, checks: {}, error: "PRIVATE_VAULT_NOT_CONFIGURED" }, 503, cors);
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await serviceClient.rpc("obsidian_api_get_gm_base");
    if (error || !isRecord(data)) return json({ ready: false, checks: {}, error: "PRIVATE_VAULT_UNAVAILABLE" }, 503, cors);
    const required = ["OBSIDIAN_MASTER_PROMPT", "SRD_5_2_1", "EKDRASIL_WORLD_BIBLE", "CHARACTER_GENERATION_GUIDE"];
    const checks = Object.fromEntries(required.map((kind) => {
      const entry = data[kind];
      return [kind, isRecord(entry) && typeof entry.content === "string" && entry.content.trim().length > 0];
    })) as Record<string, boolean>;
    const obsidian = data.OBSIDIAN_MASTER_PROMPT;
    const rules = data.SRD_5_2_1;
    checks.OBSIDIAN_MASTER_PROMPT = isRecord(obsidian) &&
      typeof obsidian.content === "string" && obsidian.content.trim().length > 0 &&
      typeof obsidian.title === "string" && obsidian.title.includes("4.1");
    checks.SRD_5_2_1 = isRecord(rules) &&
      typeof rules.content === "string" && rules.content.trim().length > 0 &&
      typeof rules.title === "string" && rules.title.includes("5.2.1") &&
      Number(rules.version) >= 2;
    checks.EKDRASIL_WORLD_BIBLE = isEkdrasilCanonV24(data.EKDRASIL_WORLD_BIBLE);
    checks.ROUTERAI_API_KEY = Boolean(ROUTERAI_API_KEY);
    const canon = isRecord(data.EKDRASIL_WORLD_BIBLE) ? data.EKDRASIL_WORLD_BIBLE : {};
    const ready = Object.values(checks).every(Boolean);
    return json({
      ready,
      checks,
      canon: {
        edition: "2.4",
        sourceVersion: typeof canon.version === "number" ? canon.version : null,
        sha256: typeof canon.sha256 === "string" ? canon.sha256 : null,
      },
    }, 200, cors);
  }

  const isCompatibilityRequest = isRecord(body) && body.operation === "VALIDATE_CHARACTER_COMPATIBILITY";
  console.log("[obsidian-gm] operation received", { operation: isRecord(body) ? String(body.operation ?? "GAME_TURN") : "INVALID_BODY", bodyLength: rawBody.length });
  const isBiographyRequest = isRecord(body) && ["GENERATE_CHARACTER_BIOGRAPHY","GENERATE_CHARACTER_APPEARANCE","GENERATE_CHARACTER_STORY","GENERATE_CHARACTER_ORIGINS"].includes(String(body.operation));
  const isAppearanceRequest = isRecord(body) && body.operation === "GENERATE_CHARACTER_APPEARANCE";
  const isStoryRequest = isRecord(body) && body.operation === "GENERATE_CHARACTER_STORY";
  const isOriginsRequest = isRecord(body) && body.operation === "GENERATE_CHARACTER_ORIGINS";
  const isIdentityRequest = isRecord(body) && body.operation === "GENERATE_RANDOM_CHARACTER_IDENTITY";
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
  if (!commonRequestValid || (!isBiographyRequest && !isIdentityRequest && !isCompatibilityRequest && !turnRequestValid)) {
    return json({ error: { code: "INVALID_REQUEST", message: "The game-master request has an invalid shape or unsupported model." } }, 400, cors);
  }
  let inputText = requestBody.input as string;
  if (isCompatibilityRequest || isStoryRequest) {
    try {
      const parsedInput = JSON.parse(inputText);
      inputText = JSON.stringify(compactAuditValue(parsedInput));
      const maxInputLength = isCompatibilityRequest ? 34_000 : 12_000;
      if (inputText.length > maxInputLength) inputText = inputText.slice(0, maxInputLength);
    } catch { /* keep the original input so malformed dossiers are reported accurately */ }
  }
  if (requestBody.operation === "GAME_TURN") {
    let parsedTurnInput: unknown;
    try { parsedTurnInput = JSON.parse(inputText); }
    catch { return json({ error: { code: "INVALID_GAME_TURN_INPUT", message: "Контекст игрового хода повреждён." } }, 400, cors); }
    const completedRolls = isRecord(parsedTurnInput) && Array.isArray(parsedTurnInput.completedRolls)
      ? parsedTurnInput.completedRolls : [];
    if (completedRolls.length > 5) {
      return json({ error: { code: "TOO_MANY_COMPLETED_ROLLS", message: "За один ход можно передать не более пяти результатов бросков." } }, 400, cors);
    }
    for (const item of completedRolls) {
      if (!isRecord(item) || typeof item.formula !== "string" || !Array.isArray(item.dice) ||
          !Number.isInteger(item.modifier) || !Number.isInteger(item.total) || !isRecord(item.proof)) {
        return json({ error: { code: "INVALID_COMPLETED_ROLL", message: "Структура завершённого броска повреждена." } }, 400, cors);
      }
      const proof = item.proof;
      const formula = item.formula;
      const parsedFormula = parseDiceFormula(formula);
      const dice = item.dice;
      const diceValid = parsedFormula !== null && dice.length === parsedFormula.totalDice &&
        dice.every((die) => isRecord(die) && Number.isInteger(die.value) &&
          Number.isInteger(die.sides) && typeof die.kept === "boolean" &&
          (die.value as number) >= 1 && (die.value as number) <= (die.sides as number));
      const arithmeticValid = diceValid && parsedFormula !== null &&
        item.modifier === parsedFormula.modifier &&
        item.total === dice.reduce((sum, die) => sum + (isRecord(die) && die.kept ? die.value as number : 0), 0) + item.modifier;
      const proofValid = typeof proof.userId === "string" && proof.userId === authData.user.id &&
        typeof proof.issuedAt === "number" && typeof proof.nonce === "string" &&
        typeof proof.signature === "string" && await verifyDiceProof({
          userId: proof.userId, issuedAt: proof.issuedAt, nonce: proof.nonce,
          signature: proof.signature, formula, dice, modifier: item.modifier as number,
          total: item.total as number,
        });
      if (!arithmeticValid || !proofValid) {
        return json({ error: { code: "INVALID_DICE_PROOF", message: "Результат броска не подтверждён сервером или срок его действия истёк. Выполни бросок заново." } }, 401, cors);
      }
    }
  }
  const instructionText = requestBody.instructions as string;
  const selectedSchema: JsonRecord = isCompatibilityRequest ? compatibilitySchema : isIdentityRequest ? identitySchema : isAppearanceRequest ? appearanceSchema : isStoryRequest ? storySchema : isOriginsRequest ? originsSchema : isBiographyRequest ? biographySchema : (((requestBody.text as JsonRecord).format as JsonRecord).schema as JsonRecord);
  const schema: JsonRecord = isRecord(body) && body.operation === "GAME_TURN" ? boundGameTurnSchema(selectedSchema) : selectedSchema;
  const schemaName = isCompatibilityRequest ? "obsidian_character_compatibility" : isIdentityRequest ? "obsidian_random_character_identity" : isAppearanceRequest ? "obsidian_character_appearance" : isStoryRequest ? "obsidian_character_story" : isOriginsRequest ? "obsidian_character_origins" : isBiographyRequest ? "obsidian_character_biography" : "obsidian_game_turn";
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
      typeof privateSources.OBSIDIAN_MASTER_PROMPT.content !== "string" ||
      typeof privateSources.OBSIDIAN_MASTER_PROMPT.title !== "string" ||
      !privateSources.OBSIDIAN_MASTER_PROMPT.title.includes("4.1")) {
    console.error("[obsidian-gm] private source read failed", privateSourcesError?.message ?? "missing master prompt");
    return json({ error: {
      code: "OBSIDIAN_MASTER_PROMPT_NOT_CONFIGURED",
      message: "В постоянную базу мастера ещё не добавлен ОБСИДИАН 4.1. Игровой запрос не отправлен.",
    } }, 503, cors);
  }
  console.log("[obsidian-gm] private sources loaded", { operation: isCompatibilityRequest ? "VALIDATE_CHARACTER_COMPATIBILITY" : String(requestBody.operation ?? "GAME_TURN"), masterPromptChars: privateSources.OBSIDIAN_MASTER_PROMPT.content.length, rulesChars: isRecord(privateSources.SRD_5_2_1) && typeof privateSources.SRD_5_2_1.content === "string" ? privateSources.SRD_5_2_1.content.length : 0, canonChars: isRecord(privateSources.EKDRASIL_WORLD_BIBLE) && typeof privateSources.EKDRASIL_WORLD_BIBLE.content === "string" ? privateSources.EKDRASIL_WORLD_BIBLE.content.length : 0 });
  const masterPrompt = privateSources.OBSIDIAN_MASTER_PROMPT.content;
  const rulesDoc = isRecord(privateSources.SRD_5_2_1) && typeof privateSources.SRD_5_2_1.content === "string"
    ? privateSources.SRD_5_2_1.content : "";
  // Story/appearance/origin generation does not need the 1.4 MB SRD document.
  // Skip its split/scoring work to stay below the Edge CPU limit.
  // Compatibility audits are strictly about Ekdrasil lore; do not load or rank SRD rules.
  const needsRulesContext = !isStoryRequest && !isAppearanceRequest && !isIdentityRequest && !isOriginsRequest && !isCompatibilityRequest;
  // Keep the full source in storage, but do not split and rescore 1.4 MB into
  // an unbounded prompt on every turn. The bounded selector below preserves
  // whole paragraphs and source line ranges.
  const ruleParagraphs = needsRulesContext ? rulesDoc : "";
  const canonSource = privateSources.EKDRASIL_WORLD_BIBLE;
  if (!isEkdrasilCanonV24(canonSource)) {
    console.error("[obsidian-gm] canonical source version rejected", {
      title: isRecord(canonSource) ? canonSource.title ?? null : null,
      version: isRecord(canonSource) ? canonSource.version ?? null : null,
      sha256: isRecord(canonSource) ? canonSource.sha256 ?? null : null,
    });
    return json({ error: {
      code: "EKDRASIL_CANON_VERSION_MISMATCH",
      message: "Мастер остановлен: требуется полная каноническая редакция Экдрасиля 2.4. Старая редакция не будет использована.",
    } }, 503, cors);
  }
  const canonDoc = canonSource.content;
  const characterGuide = isRecord(privateSources.CHARACTER_GENERATION_GUIDE) && typeof privateSources.CHARACTER_GENERATION_GUIDE.content === "string"
    ? privateSources.CHARACTER_GENERATION_GUIDE.content : "";
  if (!rulesDoc.trim() || !isRecord(privateSources.SRD_5_2_1) ||
      typeof privateSources.SRD_5_2_1.title !== "string" ||
      !privateSources.SRD_5_2_1.title.includes("5.2.1") ||
      Number(privateSources.SRD_5_2_1.version) < 2) {
    return json({ error: {
      code: "SRD_SOURCE_NOT_CONFIGURED",
      message: "Требуется полный D&D 2024 System Reference Document 5.2.1. Игровой запрос не отправлен.",
    } }, 503, cors);
  }
  let actionText = inputText.toLowerCase();
  try {
    const parsedInput = JSON.parse(inputText);
    if (isRecord(parsedInput) && typeof parsedInput.action === "string") actionText = parsedInput.action.toLowerCase();
  } catch { /* use raw input for matching */ }
  if (isBiographyRequest || isIdentityRequest) actionText = inputText.toLowerCase();
  const mappedTerms: string[] = [];
  if (isIdentityRequest) mappedTerms.push("fighter","rogue","barbarian","character classes","background","species","origin feat","ability score");
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
  // Universal action coverage: social interaction, investigation, object use and exploration.
  if (/разговор|бесед|диалог|спрос|расспрос|переговор|уговор|убед|торг|сделк|подкуп/.test(actionText)) {
    mappedTerms.push("social interaction", "influence", "persuasion", "friendly attitude", "indifferent attitude", "hostile attitude");
  }
  if (/обман|лж|врат|притвор|выдать себя|скрыть правд/.test(actionText)) mappedTerms.push("deception", "social interaction", "influence");
  if (/запуг|угроз|надавить|устраш/.test(actionText)) mappedTerms.push("intimidation", "social interaction", "influence", "hostile attitude");
  if (/прочитать намер|понять мотив|распознать лож|чувств|подозрева.*вр|искрен/.test(actionText)) mappedTerms.push("insight", "social interaction", "determine an NPC's attitude");
  if (/исслед|расслед|изуч|разобрат|обыск|найти.*ули|улиц|доказательств/.test(actionText)) mappedTerms.push("investigation", "study action", "search action", "ability check");
  if (/откры|вскры|взлом|замок|заперт|двер|сундук|механизм/.test(actionText)) mappedTerms.push("utilize action", "thieves' tools", "sleight of hand", "ability check", "object interaction");
  if (/ловуш|растяж|капкан|сигнализац|скрыт.*механизм/.test(actionText)) mappedTerms.push("perception", "investigation", "traps", "tools");
  if (/карман|украсть|подмен|незаметно взять|ловкость рук/.test(actionText)) mappedTerms.push("sleight of hand", "thieves' tools", "dexterity check");
  if (/живот|лошад|кон|пёс|собак|звер|прируч|успокоить живот/.test(actionText)) mappedTerms.push("animal handling", "influence", "ability check");
  if (/леч|первая помощь|стабилиз|диагноз|ранен/.test(actionText)) mappedTerms.push("medicine", "healing", "stabilize", "utilize action");
  if (/след|отпечат|выжива|ориентир|погода|охот|добыть пищ/.test(actionText)) mappedTerms.push("survival", "tracking", "foraging", "travel pace");
  if (/религ|бож|обряд|культ|святын/.test(actionText)) mappedTerms.push("religion", "holy symbol", "divine magic");
  if (/истор|древн|летопис|герб|родослов/.test(actionText)) mappedTerms.push("history", "historical lore");
  if (/природ|растен|гриб|ядовит|минерал|животн/.test(actionText)) mappedTerms.push("nature", "environment");
  if (/арк|маг|заклин|руна|чар|магическ/.test(actionText)) mappedTerms.push("arcana", "spellcasting", "magic");
  if (/выступ|петь|играть музыку|танцев|представлени/.test(actionText)) mappedTerms.push("performance", "social interaction");
  if (/внимател|осматрива|всматр|прислуш|замет|наблюда|ищу.*подозр/.test(actionText)) mappedTerms.push("perception", "search action", "study action");
  if (/перенос|поднять|толкнуть|тащить|сдвинуть|удержать|перелез|перепрыг/.test(actionText)) mappedTerms.push("athletics", "strength check", "jump", "climb", "push", "drag", "lift");
  if (isCompatibilityRequest) mappedTerms.push(
    "character creation", "character sheet", "character origins", "species", "background",
    "ability scores", "ability score improvement", "proficiency bonus", "saving throw proficiency",
    "skill proficiency", "class features", "class level", "level advancement", "origin feat",
    "weapon", "weapon mastery", "armor", "shield", "equipment", "starting equipment",
    "adventuring gear", "tools", "coins", "carrying capacity", "weight", "encumbrance",
    "spellcasting", "spells", "magic items", "languages", "hit points", "armor class"
  );
  const ruleTerms = [...new Set([...actionText.split(/[^a-z0-9а-яё]+/i), ...mappedTerms].filter((term) => term.length > 3))];
  const selectedRules = selectRuleExcerpts(
    ruleParagraphs,
    ruleTerms,
    isCompatibilityRequest ? 9_000 : 14_000,
    isCompatibilityRequest ? 8 : 12,
  );
  const rulesSourceSha = isRecord(privateSources.SRD_5_2_1) && typeof privateSources.SRD_5_2_1.sha256 === "string"
    ? privateSources.SRD_5_2_1.sha256 : "UNKNOWN";
  const rulesContext = selectedRules.length
    ? "ПОДТВЕРЖДЁННЫЕ ФРАГМЕНТЫ SRD 5.2.1:" + String.fromCharCode(10) +
      selectedRules.map((item) =>
        `[RULE SOURCE: D&D 2024 SRD 5.2.1; sourceId=SRD_5_2_1; SHA-256=${rulesSourceSha}; lines ${item.startLine}–${item.endLine}; relevance=${item.score}]\\n${item.text}`
      ).join(String.fromCharCode(10) + String.fromCharCode(10))
    : "SRD 5.2.1: релевантные фрагменты не найдены в пределах проверенного источника; не выдумывай точные механические детали.";
  const canonSearchParts = [actionText];
  let inputMetrics = measureGameTurnInput(null);
  if (isIdentityRequest) canonSearchParts.push("Вальдгард Элион Аэлиндор Кхар-Дорн Крейнхольм Тар-Нер Равенск Морвейн Греймарк Азра-Кал Рахимар Ша-Мер Вальдрум Скайнхейм Эйргард Морнхольд", "Том XI §44", "народ культура город происхождение");
  try {
    const parsed = JSON.parse(inputText);
    inputMetrics = measureGameTurnInput(parsed);
    if (isRecord(parsed)) {
      const campaign = isRecord(parsed.campaign) ? parsed.campaign : {};
      const character = isRecord(parsed.playerCharacterState) ? parsed.playerCharacterState : {};
      canonSearchParts.push(
        String(campaign.startLocationName ?? ""),
        String(campaign.currentInGameDate ?? ""),
        String(campaign.startNarrative ?? ""),
        String(character.speciesAndClass ?? ""),
        JSON.stringify(parsed.parsedDossier ?? parsed.character ?? parsed.generationBasis ?? {}),
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
  const canonExcerptBudget = isCompatibilityRequest ? 5_500 : isStoryRequest ? 5_000 : 12_000;
  const canonParagraphLimit = isCompatibilityRequest ? 10 : isStoryRequest ? 8 : 12;
  const canonExcerpts = selectCanonExcerpts(canonDoc, canonTerms, canonExcerptBudget, canonParagraphLimit);
  const selectedCanon = canonExcerpts.map((item) => {
    const headingPath = item.headingPath.join(" > ") || "UNKNOWN SECTION";
    return `[CANON SOURCE: Ekdrasil_Master_Canon_v2.4.md; sourceId=EKDRASIL_WORLD_BIBLE; SHA-256=${EKDRASIL_CANON_SHA256}; sectionId=${item.sectionId}; headingPath=${headingPath}; lines ${item.startLine}–${item.endLine}; relevance=${item.score}]\n${item.text}`;
  });
  const canonAuthority = [
    "ИСТОЧНИК ИСТИНЫ: Ekdrasil_Master_Canon_v2.4.md — полная редакция 2.4, 41 том, 250 нумерованных разделов. SHA-256 исходного файла: " + EKDRASIL_CANON_SHA256 + ".",
    "СОВРЕМЕННОЕ СОСТОЯНИЕ ГЛОБАЛЬНОГО МИРА: 2000 год. Глобальная хроника заканчивается 2000 годом; события после него не предопределены и развиваются отдельно в каждой кампании либо по отдельно утверждённому сценарию.",
    "СТАТУСЫ ИСТОЧНИКОВ: CANON-CORE и CANON-EXPANDED редакции 2.4 — действующий мировой канон. CAMPAIGN-STATE — только состояние конкретной кампании; никогда не переносить его в глобальную хронику или другую кампанию без отдельного утверждения владельца мира.",
    "РАЗДЕЛЕНИЕ ЗНАНИЙ: знание мастера о действительной истине не означает, что её знают персонаж игрока, NPC или фракция. Каждое знание NPC должно иметь путь получения и источник в событиях кампании. Различай действительное событие, документальное подтверждение, слух и личное убеждение.",
    "ЗАЩИТА МИРА: не добавляй четвёртое измерение, не меняй устройство Рая, Экдрасиля и Ада, законы душ, благодати и брешей, а также крупные исторические, географические и политические факты. Новые локальные детали допустимы только без противоречия редакции 2.4.",
    "НЕИЗВЕСТНОЕ: отсутствие фрагмента в текущей выборке не доказывает отсутствие факта в полной энциклопедии. Не выдумывай. Уточняй либо используй UNKNOWN; при спорном факте ищи подтверждение в источнике.",
  ].join(String.fromCharCode(10) + String.fromCharCode(10));
  const canonContext = selectedCanon.length
    ? canonAuthority + String.fromCharCode(10) + String.fromCharCode(10) +
      "РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ ПОЛНОЙ ХРОНИКИ 2.4:" + String.fromCharCode(10) +
      selectedCanon.join(String.fromCharCode(10) + String.fromCharCode(10))
    : canonAuthority + String.fromCharCode(10) + String.fromCharCode(10) +
      "Релевантные фрагменты по запросу не найдены. Не выдумывай сведения о мире; используй UNKNOWN и не заменяй отсутствие фрагмента вымышленным фактом.";

  const isCharacterGeneration = isBiographyRequest || isIdentityRequest || isCompatibilityRequest || /созда(й|ть|ние).{0,40}персонаж|генерац.{0,30}персонаж|биографи.{0,30}персонаж|character generation/i.test(actionText);
  const isGameTurnRequest = requestBody.operation === "GAME_TURN";
  const highImpactTurn = isBiographyRequest || isIdentityRequest || /атак|бой|урон|ранен|смерт|спасброс|заклин|ресурс|инвентар|деньг|фракц|npc|переговор|обман|скрыт|задани|квест|проклят|мутац/i.test(actionText);
  // Character creation must finish comfortably inside the Edge Function wall-clock limit.
  // Two bounded attempts are more reliable than three long sequential waits.
  // Character generation is one bounded upstream call. Sequential model fallbacks
  // keep the HTTP request alive too long and the mobile client drops it.
  const requestedModelOrder: GameMasterModelId[] = isGameTurnRequest
    // DeepSeek and Gemini have already reviewed canon/state and rules/character;
    // Claude performs the first synthesis pass, with the other providers as fallbacks.
    ? ["anthropic/claude-sonnet-5.5", "google/gemini-4-argon"]
    : selectGameMasterModelOrder({
      isCompatibilityRequest,
      isStoryRequest,
      isIdentityRequest,
      isBiographyRequest,
      highImpactTurn,
      isGameTurnRequest,
    });
  const orderedModelAttempts = requestedModelOrder.map((id) => MODEL_ATTEMPTS.find((attempt) => attempt.id === id))
    .filter((attempt): attempt is ModelAttempt => Boolean(attempt));
  const characterGuideContext = isCharacterGeneration
    ? (characterGuide.trim()
      ? "=== РЕФЕРЕНС МЕТОДИКИ ГЕНЕРАЦИИ ПЕРСОНАЖЕЙ (НЕ КАНОН И НЕ ПРАВИЛА) ===" + String.fromCharCode(10) + characterGuide
      : "РЕФЕРЕНС МЕТОДИКИ ГЕНЕРАЦИИ ПЕРСОНАЖЕЙ НЕ ЗАГРУЖЕН. Не выдумывай его содержание; используй только основной промт, подтверждённый канон и SRD.")
    : "";
  const serverInstructions = isCompatibilityRequest ? [
    "Ты — аудитор канона мира Экдрасиль. Проверь только соответствие загруженного персонажа установленному лору Экдрасиля. Это аудит биографии и мировых фактов, не проверка механики D&D: не пересчитывай характеристики, навыки, атаки, классовые уровни и ресурсы.",
    "Источник доказательств — исходный текст досье sourceText и sourceTextTail. parsedDossier — вспомогательное извлечение, которое может ошибаться. Не объявляй конфликт, если факт подтверждён в исходном тексте. Не подменяй авторские названия предметов стандартными предметами.",
    "Проверь народ/вид и его описанные особенности, предысторию, место рождения и географию, даты и исторические события, организации, имена, NPC, происхождение и свойства необычных предметов, проклятия и магические явления — только там, где досье содержит соответствующие сведения.",
    "Неизвестное не является противоречием. Не требуй отсутствующие сведения и не выдумывай канон. Личные события, семья, возраст и авторские детали биографии не являются нарушением сами по себе. Явно описанные домашние правила кампании не объявляй конфликтом с каноном.",
    "Особые оговорки досье: уровень 21 = Fighter 20 + эпический уровень «Память веков» — согласованное расширение кампании, не конфликт; возраст 1879 лет при рождении в 121 году и текущем 2000 году, внешний возраст около 21 — остановка старения в авторской биографии, не арифметическая ошибка; возвращение через 168 часов после смерти — личное проклятие, не стандартное воскрешение.",
    "Предметы проверяй по точным названиям: «Кожа Последнего Часа» — авторский проклятый лёгкий доспех с описанным происхождением; Cloak of Protection и Boots of Elvenkind указаны в досье с официальными источниками. Не переименовывай авторский доспех в Studded Leather +3. Подробно описанный предмет не считай неподтверждённым только из-за авторского названия.",
    "Статусы: COMPATIBLE — существенных противоречий нет; COMPATIBLE_WITH_NOTES — противоречий нет, но есть неизвестное; INCOMPATIBLE — доказанное противоречие канону; INSUFFICIENT_DATA — невозможно идентифицировать или проверить досье.",
    "Верни краткий русский JSON строго по схеме. summary — одно-два коротких предложения. Не более двух пунктов в каждом массиве, каждый до 14 слов. supportedFacts — подтверждённые каноном факты; conflicts — только доказанные противоречия с причиной; unknowns — неизвестные сведения; requiredChanges — необходимые изменения только при реальном конфликте. Пустой список — [].",
    "=== ФРАГМЕНТЫ ХРОНИКИ ЭКДРАСИЛЯ ===",
    canonContext,
  ] : isIdentityRequest ? [
    "Ты — генератор личности персонажа для D&D 2024 в мире Экдрасиль. Верни только один компактный JSON строго по схеме. Выбери имя, народ, класс, предысторию, возраст 18–80, гендерное представление и подтверждённый город рождения. Добавь краткую семью, воспитание, ровно два жизненных события, две черты, идеал, привязанность, слабость, мотивацию и личное желание. Все значения короткие, конкретные, на русском. Не пиши длинную прозу, вступление, Markdown или пояснения. Не создавай внешность, экипировку или подробную биографию — это следующий этап.",
    "Канон имеет приоритет: выбирай город только из разрешённого списка и используй только переданные ниже подтверждённые фрагменты. Не придумывай новые города, страны, фракции, исторические события или NPC. Личные семейные обстоятельства можно выдумывать, не выдавая их за мировой канон.",
    canonContext
  ] : isAppearanceRequest ? [
    "Ты создаёшь только внешность персонажа Экдрасиля. Верни строго JSON по схеме. Используй имя, народ, возраст, пол, профессию, биографию и снаряжение из входа. Заполни 11 полей внешности конкретно: рост, телосложение, кожа, волосы, глаза, лицо, одежда, обувь, аксессуары, отличительные особенности, первое впечатление. Каждое поле не менее 20 слов? Нет: кратко, обычно 8–20 слов, без повторов. Не добавляй сверхъестественных черт. Не изменяй личность.",
    canonContext
  ] : isStoryRequest ? [
    "Ты пишешь краткую, живую предысторию персонажа Экдрасиля за последний месяц перед стартом кампании. Верни только JSON по схеме. Поле biography: 140–170 русских слов, 2–3 абзаца; только события последнего месяца, путь и причина прибытия к точке старта. birthplaceSource — одна короткая фраза. canonBasis — ровно 2 коротких подтверждённых факта из канона. inventedDetailsNotice — одна короткая фраза. Не повторяй входные поля, не добавляй вступление и вывод. Используй только переданные факты персонажа; личные бытовые детали допустимы, но не выдумывай мировые события, NPC, организации или географию. Не меняй личность, механику и снаряжение.",
    canonContext
  ] : isOriginsRequest ? [
    "Ты объясняешь происхождение уже имеющихся навыков, оружия и снаряжения. Верни строго JSON по схеме. skillOrigins: по одной строке на каждый навык из входного skillBonuses, формат 'точное имя навыка — конкретное происхождение не менее 20 слов'. weaponBackground объясняет только переданное оружие. equipmentBackground объясняет только предметы входного inventory. Не добавляй и не удаляй навыки, оружие, предметы или механические свойства.",
    canonContext
  ] : [
    masterPrompt,
    ...(isGameTurnRequest ? [ENGINE_BOUNDARY_RULES, ENGINE_BOUNDARY_CHECK] : []),
    characterGuideContext,
    "=== СЛУЖЕБНЫЕ ИНСТРУКЦИИ ПРИЛОЖЕНИЯ ===",
    instructionText,
    "=== ПРОТОКОЛ ИСТОЧНИКОВ И ПАМЯТИ ===",
    "Соблюдай разделение источников: правила D&D 2024/SRD определяют механику; ОБСИДИАН 4.1 определяет процедуру ведения; Библия Экдрасиля определяет неизменяемые факты мира; текущее состояние кампании и подтверждённый журнал определяют уже произошедшие события этой конкретной кампании; лист персонажа определяет только данные героя; последнее сообщение игрока — намерение, а не свершившийся факт. Более низкий источник не переписывает более высокий. События кампании могут менять локальное состояние и отношения, но не могут задним числом менять мировую хронику. При отсутствии подтверждения используй UNKNOWN и задай уточняющий вопрос, если без него нельзя честно разрешить действие.",
    "Перед каждым ответом прочитай FULL_CAMPAIGN_CHRONICLE и recentJournal во входном JSON. Хронология, обещания, долги, предметы, травмы, отношения, последствия и уже раскрытые тайны должны сохраняться. Не пересоздавай NPC, локации или факты, которые уже существуют в состоянии кампании.",
    "=== УНИВЕРСАЛЬНЫЙ ЦИКЛ РАЗРЕШЕНИЯ ЛЮБОГО ДЕЙСТВИЯ ===",
    "Не ограничивайся боем. Любой свободный текст игрока сначала классифицируй по намерению и объекту взаимодействия: социальное действие/диалог; наблюдение и восприятие; исследование и поиск улик; взаимодействие с предметом/дверью/замком/ловушкой; перемещение и физическое действие; скрытность и ловкость рук; знания и воспоминания; животные; лечение; выживание и путешествие; магия; бой; отдых; использование предмета или способности. Если действие смешанное, разрешай его последовательными этапами, не пропуская зависимость одного этапа от другого.",
    "Для каждого действия последовательно: (1) установи точное намерение; (2) проверь доступность действия по положению, времени, дистанции, состоянию, инвентарю и ресурсам героя; (3) собери факты о цели из текущего состояния, журнала, канона 2.4 и относящихся к делу разделов SRD 5.2.1; (4) выбери правило, характеристику/навык/инструмент и DC/AC только если исход действительно неопределён; (5) заранее зафиксируй DC/AC и владельца каждого броска; (6) запроси или автоматически выполни бросок; (7) разреши исход по фактическому результату; (8) только затем примени причинно допустимые изменения и сохрани их.",
    "Не требуй кубик за каждое действие. Обычный разговор, очевидный осмотр, свободное взаимодействие с доступным предметом и действие без неопределённого риска разрешай без броска. В диалоге сначала веди естественную беседу от лица NPC с учётом его характера, целей, отношений, знаний и текущей ситуации. Проверка Persuasion нужна для попытки повлиять/убедить, Deception — обмануть, Intimidation — запугать; Insight — когда герой пытается прочитать мотивы, искренность или состояние собеседника. Не превращай каждую реплику в социальный бросок и не позволяй одному успешному броску автоматически подчинить NPC или изменить его убеждения.",
    "Различай Perception, Investigation и Study: Perception — заметить то, что доступно чувствам; Investigation — вывести закономерность, исследовать механизм или искать улики; Study — внимательно изучить сведения/объект по правилам D&D 2024. Для замков, ловушек, инструментов, карманных действий и ремесла проверяй подходящий инструмент и владение, не подменяй всё одной проверкой Восприятия.",
    "Игрок бросает только за главного героя через видимый интерфейс кубика. Мастер автоматически бросает через защищённый сервер за каждого NPC, монстра, союзника, противника и прочее существо/окружение. В состязании назначай отдельного владельца каждой стороны. В ответе каждого броска обязательно указывай roller: PLAYER или GM. Для PLAYER показывается экранный кубик игрока; для GM приложение выполняет серверный бросок автоматически. Не проси игрока вводить числовой результат вручную.",
    "Пока ожидается любой бросок PLAYER или GM, не меняй HP, время, инвентарь, деньги, ресурсы, состояния, NPC, квесты, локацию, окружение и последствия. После результата продолжай именно незавершённое действие, используя зафиксированные DC/AC и контекст; не начинай его заново и не пересчитывай сложность задним числом. Не описывай обнаруженное, попадание, успех или провал до получения нужного результата.",
    "=== ЗАКРЫТЫЙ КОНТЕКСТ ПРАВИЛ ===",
    rulesContext,
    "=== ПОСТОЯННАЯ БИБЛИЯ МИРА ===",
    canonContext,
    ...(isIdentityRequest ? [] : isStoryRequest ? [
      "РЕЖИМ ПОСЛЕДНЕГО МЕСЯЦА: опиши только примерно 30 дней перед стартом кампании, не всю жизнь. Дай краткую последовательность: положение месяц назад, 1–2 личных или бытовых события, причина отправиться к старту и прибытие. Не изменяй личность, механику, навыки, снаряжение и канон. Не добавляй NPC, фракции, преступления, квесты, мировые события или географию без основания во входе. Не выдумывай точные даты. Все поля на русском."
    ] : isBiographyRequest ? [
      "РЕЖИМ ГЕНЕРАЦИИ БИОГРАФИИ: не изменяй механику, имя, народ, класс, предысторию, возраст, гендерное представление, семью, воспитание, события жизни, черты характера, идеал, привязанность, слабость, мотивацию, желание перед началом кампании, место рождения, источник места рождения или canonBasis, переданные в JSON. Возвращай все эти поля дословно; дополняй только подробное описание, внешность и происхождение уже имеющихся навыков/снаряжения.",
      "Создай индивидуальное полное досье на русском языке. Обязательно заполни appearanceDetails как отдельную подробную таблицу внешности: рост, телосложение, кожа, волосы, глаза, лицо, одежда с конкретными предметами и состоянием, обувь, аксессуары, отличительные особенности и первое впечатление. Значения должны быть конкретными, согласованными с народом, возрастом, профессией, климатом и достатком; не используй общие заглушки. Поле appearance оставь кратким сводным описанием. Обязательно заполни preCampaignDesire: конкретное личное желание персонажа в Экдрасиле непосредственно перед началом кампании, не глобальную судьбу и не навязанный квест. Помимо биографии заполни skillOrigins: по одному содержательному объяснению происхождения каждого уже имеющегося навыка из skillBonuses входного персонажа; не добавляй и не удаляй навыки. Заполни weaponBackground: объясни, откуда персонаж получил именно переданное оружие, как научился им пользоваться и почему носит его; не меняй название оружия, атаку, урон или mastery. Заполни equipmentBackground: объясни происхождение и практическую роль каждого предмета переданного inventory; не добавляй, не удаляй и не меняй предметы, количество или свойства. Свяжи эти детали с предысторией, профессией, жизненными событиями и местом происхождения. Не используй готовые универсальные клише. Не делай персонажа избранным или участником глобальных событий без основания. Не приписывай ему секретные знания, членство во фракциях или встречи с NPC.",
      "В Экдрасиле нет свободной повседневной магии. Не добавляй заклинания, заговоры, магические навыки, магическую защиту, сопротивление магии или сверхъестественные расовые черты без конкретного подтверждённого источника в каноне и явного основания в профиле персонажа. Не переноси автоматически Fey Ancestry, магические заговоры вроде Prestidigitation и другие магические черты SRD в Экдрасиль. Мутация и проклятие различны и редки; не добавляй их без явного разрешения во входных параметрах. Обычный персонаж не должен иметь мутацию или проклятие по умолчанию.",
      "Возраст, семья, воспитание и события биографии — индивидуально сгенерированные детали, а не канон. Если неизвестно — UNKNOWN. Не добавляй механические эффекты.",
      "Не создавай новые города, страны, организации, исторические события или NPC. Сведения о происхождении должны соответствовать переданным подтверждённым данным.",
    ] : []),
  ].join(String.fromCharCode(10) + String.fromCharCode(10));
  const messages = [
    { role: "system", content: Array.isArray(serverInstructions) ? serverInstructions.join(String.fromCharCode(10) + String.fromCharCode(10)) : serverInstructions },
    { role: "user", content: inputText },
  ];

  const isOpeningGameTurn = (() => {
    if (!isGameTurnRequest) return false;
    try {
      const parsed = JSON.parse(inputText);
      return isRecord(parsed) && parsed.mode === "OPENING";
    } catch { return false; }
  })();
  if (isGameTurnRequest && !isOpeningGameTurn) {
    let compactCampaignInput = inputText;
    try { compactCampaignInput = JSON.stringify(compactAuditValue(JSON.parse(inputText))); }
    catch { compactCampaignInput = inputText.slice(0, 36_000); }
    const agentStartedAt = Date.now();
    const specialistResults = await runGameTurnAgents({
      apiKey: ROUTERAI_API_KEY,
      campaignInput: compactCampaignInput,
      canonContext,
      rulesContext,
    });
    const agentContext = formatSpecialistAgentContext(specialistResults);
    messages.splice(1, 0, {
      role: "system",
      content: agentContext + String.fromCharCode(10) + String.fromCharCode(10) +
        "ПРОТОКОЛ КООРДИНАТОРА: используй отчёты как независимые предварительные проверки. Самостоятельно сверяй их с первичными фрагментами канона, SRD, листом персонажа и текущим состоянием. Список npcAgencyProposals — только гипотезы, не события и не факты: проверь цели, знания, ресурсы, местоположение и прошедшее время каждого NPC; фиксируй действие только если оно причинно обосновано текущей сценой и допустимо по канону. Не переноси неподтверждённые выводы в состояние кампании. Если агент недоступен, не имитируй его анализ; действуй консервативно по доступным первичным источникам.",
    });
    console.log("[obsidian-gm] specialist agents completed", {
      elapsedMs: Date.now() - agentStartedAt,
      agents: specialistResults.map((result) => ({
        role: result.role,
        model: result.model,
        status: result.status,
        findings: result.findings.length,
        uncertainties: result.uncertainties.length,
        npcAgencyProposals: result.npcAgencyProposals.length,
      })),
      agentContextChars: agentContext.length,
    });
  }

  const failures: string[] = [];
  for (const [attemptIndex, attempt] of orderedModelAttempts.entries()) {
    try {
      const responseFormat = attempt.format === "schema"
        ? { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } }
        : { type: "json_object" };
      const attemptStartedAt = Date.now();
      console.log("[obsidian-gm] model attempt started", { operation: String(requestBody.operation ?? "GAME_TURN"), attemptIndex, attemptTimeoutMs: isGameTurnRequest ? gameTurnAttemptTimeoutMs(attemptIndex) : null, model: attempt.id, systemChars: Array.isArray(serverInstructions) ? serverInstructions.join(" ").length : serverInstructions.length, userChars: inputText.length, rulesChars: rulesContext.length, canonChars: canonContext.length, ...inputMetrics });
      const requestHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ROUTERAI_API_KEY}`,
        "HTTP-Referer": "https://poip14poip-beep.github.io/obsidian-dnd-master./",
        "X-Title": "Obsidian D&D Master",
      };
      const modelRequestBody: JsonRecord = {
        model: attempt.id,
        messages,
        response_format: responseFormat,
        structured_outputs: true,
        temperature: (isBiographyRequest || isIdentityRequest) ? 0.82 : 0.25,
        max_tokens: isCompatibilityRequest ? 2600 : isIdentityRequest ? 3000 : isAppearanceRequest ? 2200 : isStoryRequest ? 1800 : isOriginsRequest ? 3500 : isBiographyRequest ? 6000 : isGameTurnRequest ? GAME_TURN_MAX_OUTPUT_TOKENS : 8192,
        ...(isGameTurnRequest && attempt.id.startsWith("deepseek/") ? { reasoning: { effort: DEEPSEEK_GAME_TURN_REASONING_EFFORT } } : {}),
      };
      const modelCall = await callWithEkdrasilReadTools({
        fetcher: fetch,
        url: "https://routerai.ru/api/v1/chat/completions",
        headers: requestHeaders,
        requestBody: modelRequestBody,
        enabled: isGameTurnRequest,
        rules: { content: rulesDoc, sourceId: "SRD_5_2_1", sha256: rulesSourceSha },
        canon: { content: canonDoc, sourceId: "EKDRASIL_WORLD_BIBLE", sha256: EKDRASIL_CANON_SHA256 },
        playerCharacter: playerCharacterFromInput(inputText),
        maxToolRounds: 3,
        maxToolCalls: 6,
        timeoutMs: isGameTurnRequest ? gameTurnAttemptTimeoutMs(attemptIndex) : 18_000,
      });
      const upstream = modelCall.response;
      console.log("[obsidian-gm] model response received", {
        model: attempt.id,
        status: upstream.status,
        retrievalToolCalls: modelCall.toolCalls,
        retrievalLoopExhausted: modelCall.exhausted,
      });
      if (modelCall.exhausted) {
        failures.push(`${attempt.id}: retrieval tool-call limit exceeded`);
        continue;
      }
      const raw = await upstream.text();
      console.log("[obsidian-gm] model response body received", { model: attempt.id, elapsedMs: Date.now() - attemptStartedAt, responseChars: raw.length });
      let payload: unknown = modelCall.payload;
      if (payload === null) {
        try { payload = JSON.parse(raw); }
        catch { failures.push(`${attempt.id}: unreadable response`); continue; }
      }

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
      const completionDetails = isRecord(root.usage) && isRecord(root.usage.completion_tokens_details)
        ? root.usage.completion_tokens_details : {};
      console.log("[obsidian-gm] model token usage", {
        model: attempt.id,
        promptTokens: isRecord(root.usage) ? root.usage.prompt_tokens ?? null : null,
        completionTokens: isRecord(root.usage) ? root.usage.completion_tokens ?? null : null,
        reasoningTokens: completionDetails.reasoning_tokens ?? null,
      });
      const choices = Array.isArray(root.choices) ? root.choices : [];
      const choice = isRecord(choices[0]) ? choices[0] : {};
      const message = isRecord(choice.message) ? choice.message : {};
      let content = outputText(message);
      if (!content || choice.finish_reason === "length") {
        const failure = `${attempt.id}: empty or truncated output (finish_reason=${String(choice.finish_reason ?? "unknown")}, completion_tokens=${String(isRecord(root.usage) ? root.usage.completion_tokens ?? "unknown" : "unknown")})`;
        console.warn("[obsidian-gm] model output rejected", { model: attempt.id, reason: failure, responseChars: content.length });
        failures.push(failure);
        continue;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(content); }
      catch {
        console.warn("[obsidian-gm] model output rejected", { model: attempt.id, reason: "invalid JSON", responseChars: content.length });
        failures.push(`${attempt.id}: invalid JSON`);
        continue;
      }
      if (!validateSchema(parsed, schema)) {
        console.warn("[obsidian-gm] model output rejected", { model: attempt.id, reason: "schema mismatch", responseChars: content.length, finishReason: choice.finish_reason ?? "unknown" });
        failures.push(`${attempt.id}: output does not match the required turn schema`);
        continue;
      }
      if (isGameTurnRequest && isRecord(parsed)) {
        const rolls = Array.isArray(parsed.rolls) ? parsed.rolls.filter(isRecord) : [];
        const prepared = modelCall.preparedRoll;
        const matchesPrepared = prepared !== null && rolls.length === 1 &&
          rolls[0]?.roller === prepared.roller &&
          rolls[0]?.label === prepared.label &&
          rolls[0]?.formula === prepared.formula &&
          rolls[0]?.dc === prepared.dc &&
          rolls[0]?.targetType === prepared.targetType &&
          rolls[0]?.result === "ОЖИДАЕТСЯ БРОСОК ИГРОКА";
        const invalidPendingRoll = prepared !== null ? !matchesPrepared : rolls.length > 0;
        if (invalidPendingRoll) {
          const reason = prepared
            ? "pending roll does not match the server-prepared game mechanic"
            : "pending roll was returned without a deterministic preparation tool";
          console.warn("[obsidian-gm] prepared-roll validation rejected", { model: attempt.id, reason });
          failures.push(attempt.id + ": " + reason);
          messages.push({
            role: "system",
            content: "ОТКЛОНЕНО: каждый ожидающий бросок должен быть подготовлен соответствующим серверным инструментом. Используй точные roller, label, formula, targetType и DC/AC из результата инструмента; result строго «ОЖИДАЕТСЯ БРОСОК ИГРОКА». Не придумывай бонусы и целевые значения.",
          });
          continue;
        }
      }
      if (isGameTurnRequest && isRecord(parsed) && Array.isArray(parsed.rolls) && parsed.rolls.length > 0) {
        // A pending roll is a pause in the action pipeline, not a commit.
        // Safely discard premature model mutations; they are recalculated after the actual roll.
        let currentEnvironment: JsonRecord = {
          temperatureC: null, temperatureCertainty: "UNKNOWN", weather: "UNKNOWN", lighting: "UNKNOWN",
          visibility: "UNKNOWN", wind: "UNKNOWN", precipitation: "UNKNOWN", ambientSounds: "UNKNOWN",
          ambientSmells: "UNKNOWN", notes: "",
        };
        try {
          const originalInput = JSON.parse(inputText);
          const campaign = isRecord(originalInput) && isRecord(originalInput.campaign) ? originalInput.campaign : {};
          if (isRecord(campaign.environment)) currentEnvironment = campaign.environment;
        } catch { /* preserve explicit UNKNOWN environment when campaign input is malformed */ }
        const previousChanges = isRecord(parsed.characterChanges) ? parsed.characterChanges : {};
        parsed = {
          ...parsed,
          timeDeltaMinutes: 0,
          hpDelta: 0,
          newLocationId: null,
          consequenceText: "",
          worldOutcome: "",
          campaignMemory: "",
          newInGameDate: "",
          npcChanges: [],
          questChanges: [],
          environment: currentEnvironment,
          environmentReason: "Окружение не изменяется до результата броска.",
          characterChanges: {
            ...previousChanges,
            inventory: [],
            resources: [],
            conditions: [],
            currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
          },
          stateNotes: [],
        };
        content = JSON.stringify(parsed);
      }
      if (isGameTurnRequest) {
        const semanticFailure = validateGameTurnSemantics(parsed);
        if (semanticFailure) {
          console.warn("[obsidian-gm] game-turn semantics rejected", { model: attempt.id, reason: semanticFailure });
          failures.push(`${attempt.id}: ${semanticFailure}`);
          // Give the next provider an explicit correction rather than repeating
          // the same structurally-valid but game-rule-invalid response.
          messages.push({
            role: "system",
            content: "ПРЕДЫДУЩИЙ ОТВЕТ ОТКЛОНЁН ПРОГРАММНОЙ ПРОВЕРКОЙ: " + semanticFailure +
              ". Верни исправленный JSON игрового хода. Если нужен бросок, result должен быть строго «ОЖИДАЕТСЯ БРОСОК ИГРОКА»; число генерируется защищённым сервером, никогда не угадывай его. При ожидаемом броске не меняй состояние, время, HP, NPC, квесты, предметы, ресурсы, деньги, локацию или последствия.",
          });
          continue;
        }
      }
      if (isGameTurnRequest) {
        const narrationFailure = validatePendingRollNarration(parsed);
        if (narrationFailure) {
          console.warn("[obsidian-gm] pending-roll narration rejected", { model: attempt.id, reason: narrationFailure });
          failures.push(attempt.id + ": " + narrationFailure);
          messages.push({
            role: "system",
            content: "ПРЕДЫДУЩИЙ ОТВЕТ ОТКЛОНЁН: бросок ещё не выполнен. Опиши только попытку и обстановку, не утверждай успех, провал, попадание, промах или последствие действия. Запроси ожидающий бросок и дождись его фактического результата.",
          });
          continue;
        }
      }
      if (isGameTurnRequest && isRecord(parsed) && typeof parsed.narration === "string") {
        const contradictions = checkNarration({
          conversation: modelCall.conversation as GuardMessage[],
          narration: parsed.narration,
          partyNames: partyNamesFromInput(inputText),
        });
        if (contradictions.length) {
          console.warn("[obsidian-gm] engine-boundary narration contradiction", { model: attempt.id, count: contradictions.length, kinds: [...new Set(contradictions.map((item) => item.kind))] });
          try {
            const repairBody: JsonRecord = { ...modelRequestBody, messages: [
              ...modelCall.conversation,
              { role: "assistant", content },
              { role: "system", content: buildCorrectionPrompt(contradictions) },
            ] };
            const repairResponse = await fetch("https://routerai.ru/api/v1/chat/completions", {
              method: "POST", headers: requestHeaders, body: JSON.stringify(repairBody), signal: AbortSignal.timeout(12_000),
            });
            const repairPayload: unknown = await repairResponse.json().catch(() => null);
            const repairRoot = isRecord(repairPayload) ? repairPayload : {};
            const repairChoices = Array.isArray(repairRoot.choices) ? repairRoot.choices : [];
            const repairChoice = isRecord(repairChoices[0]) ? repairChoices[0] : {};
            const repairMessage = isRecord(repairChoice.message) ? repairChoice.message : {};
            const repairedContent = outputText(repairMessage);
            let repairedParsed: unknown = null;
            try { repairedParsed = repairedContent ? JSON.parse(repairedContent) : null; } catch { repairedParsed = null; }
            const repairSemanticFailure = validateSchema(repairedParsed, schema)
              ? (validateGameTurnSemantics(repairedParsed) ?? validatePendingRollNarration(repairedParsed))
              : "corrective response does not match the required JSON schema";
            const originalNonNarration = isRecord(parsed) ? { ...parsed } : {};
            const repairedNonNarration = isRecord(repairedParsed) ? { ...repairedParsed } : {};
            delete originalNonNarration.narration;
            delete repairedNonNarration.narration;
            const changedNonNarration = stableSerialize(originalNonNarration) !== stableSerialize(repairedNonNarration);
            const repairedContradictions = isRecord(repairedParsed) && typeof repairedParsed.narration === "string"
              ? checkNarration({ conversation: modelCall.conversation as GuardMessage[], narration: repairedParsed.narration, partyNames: partyNamesFromInput(inputText) })
              : contradictions;
            if (!repairResponse.ok || repairChoice.finish_reason === "length" || repairSemanticFailure || changedNonNarration || repairedContradictions.length) {
              failures.push(attempt.id + ": engine-boundary correction failed");
              console.warn("[obsidian-gm] engine-boundary correction rejected", { model: attempt.id, httpStatus: repairResponse.status, schemaOrSemanticFailure: repairSemanticFailure, changedNonNarration, remainingContradictions: repairedContradictions.length });
              continue;
            }
            parsed = repairedParsed;
            content = repairedContent;
            console.log("[obsidian-gm] engine-boundary correction accepted", { model: attempt.id });
          } catch (error) {
            failures.push(attempt.id + ": engine-boundary correction unavailable");
            console.warn("[obsidian-gm] engine-boundary correction unavailable", { model: attempt.id, message: error instanceof Error ? error.message : String(error) });
            continue;
          }
        }
      }
      console.log("[obsidian-gm] structured response validated", { model: attempt.id, operation: isCompatibilityRequest ? "VALIDATE_CHARACTER_COMPATIBILITY" : "OTHER" });
      return json({
        output_text: content,
        model: attempt.id,
        usage: tokens(root.usage),
      }, 200, cors);
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      console.error("[obsidian-gm] model attempt failed", { model: attempt.id, timedOut, message: error instanceof Error ? error.message : String(error) });
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
