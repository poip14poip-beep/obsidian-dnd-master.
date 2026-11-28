export type SpecialistAgentRole = "CANON_AND_CAMPAIGN" | "DND_RULES_AND_CHARACTER";
export type SpecialistAgentModel =
  | "deepseek/deepseek-v4.1-flash"
  | "google/gemini-4-argon";

export interface ActionResolution {
  requiresRoll: boolean;
  roller: "PLAYER" | "GM" | "NONE";
  kind: "skill_check" | "ability_check" | "saving_throw" | "initiative" | "custom" | "none";
  skill: string | null;
  ability: string | null;
  difficulty: string | null;
  dc: number | null;
  advantage: "none" | "advantage" | "disadvantage";
  expression: string;
  reason: string;
}

export interface SpecialistAgentResult {
  role: SpecialistAgentRole;
  model: SpecialistAgentModel;
  status: "COMPLETED" | "UNAVAILABLE";
  findings: string[];
  uncertainties: string[];
  actionResolution: ActionResolution | null;
}

interface AgentRequest {
  role: SpecialistAgentRole;
  model: SpecialistAgentModel;
  system: string;
  sourceContext: string;
  campaignInput: string;
  apiKey: string;
  fetcher?: typeof fetch;
}

const AGENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: { type: "array", maxItems: 5, items: { type: "string", maxLength: 360 } },
    uncertainties: { type: "array", maxItems: 5, items: { type: "string", maxLength: 240 } },
    actionResolution: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        requiresRoll: { type: "boolean" },
        roller: { type: "string", enum: ["PLAYER", "GM", "NONE"] },
        kind: { type: "string", enum: ["skill_check", "ability_check", "saving_throw", "initiative", "custom", "none"] },
        skill: { type: ["string", "null"] },
        ability: { type: ["string", "null"] },
        difficulty: { type: ["string", "null"] },
        dc: { type: ["integer", "null"] },
        advantage: { type: "string", enum: ["none", "advantage", "disadvantage"] },
        expression: { type: "string", maxLength: 80 },
        reason: { type: "string", maxLength: 240 },
      },
      required: ["requiresRoll", "roller", "kind", "skill", "ability", "difficulty", "dc", "advantage", "expression", "reason"],
    },
  },
  required: ["findings", "uncertainties", "actionResolution"],
};

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("choices" in payload) ||
      !Array.isArray((payload as { choices: unknown }).choices)) return "";
  const choice = (payload as { choices: Array<unknown> }).choices[0];
  if (!choice || typeof choice !== "object" || !("message" in choice)) return "";
  const message = (choice as { message: unknown }).message;
  if (!message || typeof message !== "object" || !("content" in message)) return "";
  const content = (message as { content: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part && typeof part === "object" && "text" in part &&
      typeof (part as { text: unknown }).text === "string" ? (part as { text: string }).text : "").join("\n");
  }
  return "";
}

async function runSpecialistAgent(request: AgentRequest): Promise<SpecialistAgentResult> {
  const unavailable = (): SpecialistAgentResult => ({
    role: request.role,
    model: request.model,
    status: "UNAVAILABLE",
    findings: [],
    uncertainties: ["Специализированный анализатор временно недоступен; итоговый мастер обязан проверить источники самостоятельно."],
    actionResolution: null,
  });
  try {
    const response = await (request.fetcher ?? fetch)("https://routerai.ru/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
        "HTTP-Referer": "https://poip14poip-beep.github.io/obsidian-dnd-master./",
        "X-Title": "Obsidian D&D Master Specialist Agent",
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: `ИСТОЧНИКИ ДЛЯ АНАЛИЗА:\n${request.sourceContext}\n\nТЕКУЩЕЕ СОСТОЯНИЕ И ДЕЙСТВИЕ:\n${request.campaignInput}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "obsidian_specialist_findings", strict: true, schema: AGENT_SCHEMA } },
        structured_outputs: true,
        temperature: 0.1,
        max_tokens: 1_100,
      }),
      signal: AbortSignal.timeout(18_000),
    });
    if (!response.ok) return unavailable();
    const payload = await response.json().catch(() => null);
    const raw = extractContent(payload);
    if (!raw) return unavailable();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !("findings" in parsed) ||
        !("uncertainties" in parsed) || !Array.isArray((parsed as { findings: unknown }).findings) ||
        !Array.isArray((parsed as { uncertainties: unknown }).uncertainties)) return unavailable();
    const findings = (parsed as { findings: unknown[] }).findings;
    const uncertainties = (parsed as { uncertainties: unknown[] }).uncertainties;
    if (findings.length > 5 || uncertainties.length > 5 ||
        [...findings, ...uncertainties].some((item) => typeof item !== "string" || item.length > 360)) {
      return unavailable();
    }
    const resolutionRaw = (parsed as { actionResolution?: unknown }).actionResolution;
    let actionResolution: ActionResolution | null = null;
    if (resolutionRaw !== null && resolutionRaw !== undefined) {
      if (!resolutionRaw || typeof resolutionRaw !== "object" || Array.isArray(resolutionRaw)) return unavailable();
      const value = resolutionRaw as Record<string, unknown>;
      if (typeof value.requiresRoll !== "boolean" ||
          !["PLAYER", "GM", "NONE"].includes(String(value.roller)) ||
          !["skill_check", "ability_check", "saving_throw", "initiative", "custom", "none"].includes(String(value.kind)) ||
          !["none", "advantage", "disadvantage"].includes(String(value.advantage)) ||
          typeof value.expression !== "string" || value.expression.length > 80 ||
          typeof value.reason !== "string" || value.reason.length > 240 ||
          !(value.skill === null || typeof value.skill === "string") ||
          !(value.ability === null || typeof value.ability === "string") ||
          !(value.difficulty === null || typeof value.difficulty === "string") ||
          !(value.dc === null || Number.isInteger(value.dc))) return unavailable();
      actionResolution = value as unknown as ActionResolution;
    }
    if (request.role === "DND_RULES_AND_CHARACTER" && !actionResolution) return unavailable();
    return {
      role: request.role,
      model: request.model,
      status: "COMPLETED",
      findings: findings as string[],
      uncertainties: uncertainties as string[],
      actionResolution,
    };
  } catch {
    return unavailable();
  }
}

/** Run canon/state and D&D rules/character analysts concurrently before GM synthesis. */
export async function runGameTurnAgents(args: {
  apiKey: string;
  campaignInput: string;
  canonContext: string;
  rulesContext: string;
  fetcher?: typeof fetch;
}): Promise<SpecialistAgentResult[]> {
  const [canon, rules] = await Promise.all([
    runSpecialistAgent({
      role: "CANON_AND_CAMPAIGN",
      model: "deepseek/deepseek-v4.1-flash",
      apiKey: args.apiKey,
      ...(args.fetcher ? { fetcher: args.fetcher } : {}),
      system: [
        "Ты специализированный аналитик канона Экдрасиля 2.4 и непрерывности конкретной кампании.",
        "Проверь действие игрока и текущее состояние только по переданным фрагментам канона и данным кампании.",
        "Выявляй подтверждённые факты, причинные последствия, ограничения мира, знания персонажа/NPC и противоречия.",
        "Не придумывай отсутствующие сведения. Не смешивай объективную истину, знания игрока и знания NPC.",
        "Каждый вывод привязывай к sectionId/строкам канона или к полю состояния кампании. Если источника нет — uncertainty.",
        "Не предлагай механические решения D&D. Верни только краткий JSON findings и uncertainties.",
      ].join("\n"),
      sourceContext: args.canonContext,
      campaignInput: args.campaignInput,
    }),
    runSpecialistAgent({
      role: "DND_RULES_AND_CHARACTER",
      model: "google/gemini-4-argon",
      apiKey: args.apiKey,
      ...(args.fetcher ? { fetcher: args.fetcher } : {}),
      system: [
        "Ты специализированный аналитик D&D 2024 / SRD 5.2.1 и листа персонажа.",
        "Определи применимые правила, действие/реакцию/движение, нужную проверку, характеристику, навык, модификатор, преимущество/помеху, формулу броска и необходимые условия.",
        "Проверяй числа только по листу персонажа и переданным фрагментам SRD. Не выдумывай DC, AC, бонусы, ресурсы или свойства.",
        "Если для решения не хватает точного правила или значения, явно укажи uncertainty. Не описывай исход до броска.",
        "ОБЯЗАТЕЛЬНО заполни actionResolution. Это механическое решение до повествования: requiresRoll=false, roller=NONE, kind=none, остальные ссылки null и expression пустая строка для безопасного/очевидного действия без неопределённости. Если проверка нужна — requiresRoll=true, roller=PLAYER для главного героя или GM для NPC/существа; выбери точный kind, навык/характеристику, difficulty или подтверждённый DC, advantage и reason. Для игрока никогда не задавай expression: сервер вычислит бонус по листу. Для GM используй expression только из подтверждённого правила/статблока. Не выдумывай AC/оружие/урон. Если не можешь подтвердить механику, верни uncertainty и requiresRoll=false только если действие безопасно; иначе агент недоступен и ход будет остановлен.",
        "Каждый вывод привязывай к строкам SRD или полю листа персонажа. Верни только JSON findings, uncertainties и actionResolution.",
      ].join("\n"),
      sourceContext: args.rulesContext,
      campaignInput: args.campaignInput,
    }),
  ]);
  return [canon, rules];
}

/** Compact, source-attributed notes for the coordinator; these are advisory, not authority. */
export function formatSpecialistAgentContext(results: SpecialistAgentResult[]): string {
  return [
    "=== ПРЕДВАРИТЕЛЬНЫЙ АНАЛИЗ СПЕЦИАЛИЗИРОВАННЫХ АГЕНТОВ ===",
    "Это вспомогательные отчёты. Они не являются источником истины и не заменяют полный канон, SRD, лист персонажа или состояние кампании. При конфликте первичны исходные источники. Перепроверь каждый числовой и причинный вывод.",
    ...results.map((result) => [
      `АГЕНТ: ${result.role}; модель=${result.model}; статус=${result.status}`,
      result.findings.length ? `Выводы:\n- ${result.findings.join("\n- ")}` : "Выводы: нет подтверждённых выводов.",
      result.uncertainties.length ? `Неопределённости:\n- ${result.uncertainties.join("\n- ")}` : "Неопределённости: не отмечены.",
      result.actionResolution ? `МЕХАНИЧЕСКОЕ РЕШЕНИЕ: ${JSON.stringify(result.actionResolution)}` : "МЕХАНИЧЕСКОЕ РЕШЕНИЕ: отсутствует.",
    ].join("\n")),
  ].join("\n\n");
}
