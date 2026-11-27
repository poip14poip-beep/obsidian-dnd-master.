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
      name: "prepare_player_check",
      description: "Подготовить проверку главного героя по его фактическому листу. Сервер сам вычисляет бонус и формулу; игрок затем бросает кубик в интерфейсе. Вызывай до описания исхода. Не используй для атак, урона или бросков NPC.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["ABILITY_CHECK", "SKILL_CHECK", "SAVING_THROW"] },
          ability: { type: "string", enum: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma", "сила", "ловкость", "телосложение", "интеллект", "мудрость", "харизма"] },
          skill: { type: ["string", "null"], maxLength: 80 },
          dc: { type: "integer", minimum: 1, maximum: 40 },
          advantage: { type: "string", enum: ["NONE", "ADVANTAGE", "DISADVANTAGE"] },
          reason: { type: "string", minLength: 3, maxLength: 200 },
        },
        required: ["kind", "ability", "skill", "dc", "advantage", "reason"],
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

export interface PreparedPlayerRoll {
  roller: "PLAYER";
  label: string;
  formula: string;
  dc: number;
  modifier: number;
  kind: "ABILITY_CHECK" | "SKILL_CHECK" | "SAVING_THROW";
  reason: string;
}

function queryTerms(query: string): string[] {
  return [...new Set(query.normalize("NFKC").toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2))].slice(0, 24);
}

function normalizeAbility(value: string): "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma" | null {
  const aliases: Record<string, "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"> = {
    strength: "strength", str: "strength", "сила": "strength",
    dexterity: "dexterity", dex: "dexterity", "ловкость": "dexterity",
    constitution: "constitution", con: "constitution", "телосложение": "constitution",
    intelligence: "intelligence", int: "intelligence", "интеллект": "intelligence",
    wisdom: "wisdom", wis: "wisdom", "мудрость": "wisdom",
    charisma: "charisma", cha: "charisma", "харизма": "charisma",
  };
  return aliases[value.normalize("NFKC").trim().toLocaleLowerCase()] ?? null;
}

function modifierForScore(score: number): number {
  return Math.floor((score - 10) / 2);
}

function preparePlayerCheck(
  args: JsonRecord,
  playerCharacter: JsonRecord | null,
  alreadyPrepared: boolean,
): { ok: true; preparedPlayerRoll: PreparedPlayerRoll } | { ok: false; error: string } {
  if (alreadyPrepared) return { ok: false, error: "В одном ходе разрешена только одна ожидающая проверка игрока." };
  if (!playerCharacter || playerCharacter.statsCertainty !== "KNOWN" ||
      !playerCharacter.abilityScores || typeof playerCharacter.abilityScores !== "object") {
    return { ok: false, error: "Лист персонажа не содержит подтверждённых характеристик. Не выдумывай бонус; запроси уточнение." };
  }
  const kind = args.kind;
  const ability = typeof args.ability === "string" ? normalizeAbility(args.ability) : null;
  const skill = typeof args.skill === "string" && args.skill.trim() ? args.skill.trim() : null;
  const dc = args.dc;
  const advantage = args.advantage;
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (!ability || !["ABILITY_CHECK", "SKILL_CHECK", "SAVING_THROW"].includes(String(kind)) ||
      !Number.isInteger(dc) || (dc as number) < 1 || (dc as number) > 40 ||
      !["NONE", "ADVANTAGE", "DISADVANTAGE"].includes(String(advantage)) || reason.length < 3 || reason.length > 200) {
    return { ok: false, error: "Некорректные параметры проверки. Нужны тип, характеристика, DC 1–40, преимущество и причина." };
  }
  if ((kind === "SKILL_CHECK") !== Boolean(skill)) {
    return { ok: false, error: "Для SKILL_CHECK укажи точное имя навыка; для остальных видов skill должен быть null." };
  }

  const scores = playerCharacter.abilityScores as JsonRecord;
  const score = scores[ability];
  if (!Number.isInteger(score) || (score as number) < 1 || (score as number) > 30) {
    return { ok: false, error: "В листе отсутствует подтверждённая характеристика " + ability + "." };
  }
  let modifier = modifierForScore(score as number);
  const exhaustion = Array.isArray(playerCharacter.conditions) ? playerCharacter.conditions.map(String).join(" ") : "";
  const exhaustionMatch = /(?:exhaustion|истощение)\s*([1-6])/i.exec(exhaustion);
  if (exhaustionMatch) modifier -= 2 * Number(exhaustionMatch[1]);

  if (kind === "SAVING_THROW") {
    const saves = playerCharacter.savingThrowBonuses;
    if (!saves || typeof saves !== "object" || !Number.isInteger((saves as JsonRecord)[ability])) {
      return { ok: false, error: "В листе нет подтверждённого бонуса спасброска " + ability + "." };
    }
    modifier = Number((saves as JsonRecord)[ability]);
    if (exhaustionMatch) modifier -= 2 * Number(exhaustionMatch[1]);
  } else if (kind === "SKILL_CHECK") {
    const entries = Array.isArray(playerCharacter.skillBonuses) ? playerCharacter.skillBonuses : [];
    const normalizedSkill = skill!.normalize("NFKC").trim().toLocaleLowerCase();
    const entry = entries.find((item) => item && typeof item === "object" &&
      typeof (item as JsonRecord).name === "string" &&
      ((item as JsonRecord).name as string).normalize("NFKC").trim().toLocaleLowerCase() === normalizedSkill) as JsonRecord | undefined;
    if (entry) {
      const basis = typeof entry.basis === "string" ? entry.basis.toLocaleLowerCase() : "";
      const basisAbility = normalizeAbility(basis.split(/[\s+]+/)[0] ?? "");
      const expertise = /эксперт|expertise/i.test(basis);
      const proficient = /влад|proficien/i.test(basis) || expertise;
      const proficiency = Number.isInteger(playerCharacter.proficiencyBonus)
        ? Number(playerCharacter.proficiencyBonus)
        : Number.isInteger(playerCharacter.classLevel ?? playerCharacter.level)
          ? Math.ceil(Number(playerCharacter.classLevel ?? playerCharacter.level) / 4) + 1
          : null;
      if (basisAbility === ability || basisAbility === null) {
        if (!Number.isInteger(entry.bonus)) return { ok: false, error: "Бонус навыка в листе повреждён или неизвестен." };
        modifier = Number(entry.bonus);
      } else if (proficient && proficiency !== null) {
        modifier += proficiency * (expertise ? 2 : 1);
      } else if (proficient) {
        return { ok: false, error: "Неизвестен бонус мастерства для нестандартной проверки навыка." };
      }
    }
    if (exhaustionMatch) modifier -= 2 * Number(exhaustionMatch[1]);
  }

  const dice = advantage === "ADVANTAGE" ? "2d20kh1" : advantage === "DISADVANTAGE" ? "2d20kl1" : "1d20";
  const formula = modifier === 0 ? dice : dice + (modifier > 0 ? "+" : "") + String(modifier);
  const abilityRu: Record<string, string> = {
    strength: "Сила", dexterity: "Ловкость", constitution: "Телосложение",
    intelligence: "Интеллект", wisdom: "Мудрость", charisma: "Харизма",
  };
  const label = kind === "SKILL_CHECK"
    ? abilityRu[ability] + " (" + skill + ")"
    : kind === "SAVING_THROW" ? "Спасбросок " + abilityRu[ability] : "Проверка " + abilityRu[ability];
  return {
    ok: true,
    preparedPlayerRoll: {
      roller: "PLAYER", label, formula, dc: dc as number, modifier,
      kind: kind as PreparedPlayerRoll["kind"], reason,
    },
  };
}

export function executeEkdrasilReadTool(
  name: string,
  rawArguments: string,
  rules: RetrievalSource,
  canon: RetrievalSource,
  playerCharacter: JsonRecord | null = null,
  alreadyPrepared = false,
): JsonRecord {
  let args: unknown;
  try { args = JSON.parse(rawArguments || "{}"); }
  catch { return { ok: false, error: "Аргументы инструмента должны быть корректным JSON." }; }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "Ожидался объект аргументов." };
  }
  if (name === "prepare_player_check") {
    return preparePlayerCheck(args as JsonRecord, playerCharacter, alreadyPrepared);
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
  preparedPlayerRoll: PreparedPlayerRoll | null;
}

export async function callWithEkdrasilReadTools(options: {
  fetcher: typeof fetch;
  url: string;
  headers: HeadersInit;
  requestBody: JsonRecord;
  enabled: boolean;
  rules: RetrievalSource;
  canon: RetrievalSource;
  playerCharacter?: JsonRecord | null;
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
  let preparedPlayerRoll: PreparedPlayerRoll | null = null;

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
    return { ...result, toolCalls: 0, exhausted: false, preparedPlayerRoll: null };
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
    if (!result.response.ok) return { ...result, toolCalls, exhausted: false, preparedPlayerRoll };
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
      return { ...finalResult, toolCalls, exhausted: false, preparedPlayerRoll };
    }
    if (round >= maxRounds || toolCalls + calls.length > maxCalls) {
      return { ...result, toolCalls, exhausted: true, preparedPlayerRoll };
    }

    messages.push(message);
    for (const rawCall of calls) {
      const call = rawCall && typeof rawCall === "object" ? rawCall as JsonRecord : {};
      const fn = call.function && typeof call.function === "object" ? call.function as JsonRecord : {};
      const id = typeof call.id === "string" ? call.id : "";
      const name = typeof fn.name === "string" ? fn.name : "";
      const rawArgs = typeof fn.arguments === "string" ? fn.arguments : "{}";
      const toolResult = id
        ? executeEkdrasilReadTool(name, rawArgs, options.rules, options.canon, options.playerCharacter ?? null, preparedPlayerRoll !== null)
        : { ok: false, error: "У вызова инструмента отсутствует идентификатор." };
      if (toolResult && typeof toolResult === "object" && "preparedPlayerRoll" in toolResult) {
        const prepared = (toolResult as JsonRecord).preparedPlayerRoll;
        if (prepared && typeof prepared === "object") preparedPlayerRoll = prepared as PreparedPlayerRoll;
      }
      messages.push({
        role: "tool",
        tool_call_id: id || "invalid-tool-call",
        content: JSON.stringify(toolResult),
      });
      toolCalls += 1;
    }
  }
}
