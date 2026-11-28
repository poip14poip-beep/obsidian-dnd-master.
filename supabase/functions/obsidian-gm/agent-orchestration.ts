export type SpecialistAgentRole = "CANON_AND_CAMPAIGN" | "DND_RULES_AND_CHARACTER";
export type SpecialistAgentModel =
  | "deepseek/deepseek-v4.1-flash"
  | "google/gemini-4-argon";

export interface SpecialistAgentResult {
  role: SpecialistAgentRole;
  model: SpecialistAgentModel;
  status: "COMPLETED" | "UNAVAILABLE";
  findings: string[];
  uncertainties: string[];
  npcAgencyProposals: string[];
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
    npcAgencyProposals: { type: "array", maxItems: 3, items: { type: "string", maxLength: 300 } },
  },
  required: ["findings", "uncertainties", "npcAgencyProposals"],
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
    npcAgencyProposals: [],
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
        !("uncertainties" in parsed) || !("npcAgencyProposals" in parsed) ||
        !Array.isArray((parsed as { findings: unknown }).findings) ||
        !Array.isArray((parsed as { uncertainties: unknown }).uncertainties) ||
        !Array.isArray((parsed as { npcAgencyProposals: unknown }).npcAgencyProposals)) return unavailable();
    const findings = (parsed as { findings: unknown[] }).findings;
    const uncertainties = (parsed as { uncertainties: unknown[] }).uncertainties;
    const npcAgencyProposals = (parsed as { npcAgencyProposals: unknown[] }).npcAgencyProposals;
    if (findings.length > 5 || uncertainties.length > 5 || npcAgencyProposals.length > 3 ||
        [...findings, ...uncertainties].some((item) => typeof item !== "string" || item.length > 360) ||
        npcAgencyProposals.some((item) => typeof item !== "string" || item.length > 300)) {
      return unavailable();
    }
    return {
      role: request.role,
      model: request.model,
      status: "COMPLETED",
      findings: findings as string[],
      uncertainties: uncertainties as string[],
      npcAgencyProposals: npcAgencyProposals as string[],
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
        "Оцени самостоятельные действия NPC вне непосредственной сцены: исходи только из их целей, ресурсов, местоположения, отношений, знаний и реально прошедшего времени. Предложи не более трёх правдоподобных действий в npcAgencyProposals. Это гипотезы для главного мастера, не свершившиеся события; не обновляй факты и не делай NPC всеведущими. Если времени/оснований недостаточно — верни пустой массив.",
        "Не предлагай механические решения D&D. Верни краткий JSON findings, uncertainties и npcAgencyProposals.",
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
        "Каждый вывод привязывай к строкам SRD или полю листа персонажа. npcAgencyProposals всегда оставляй пустым. Верни краткий JSON findings, uncertainties и npcAgencyProposals.",
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
      result.npcAgencyProposals.length ? `Гипотезы самостоятельных действий NPC (НЕ ФАКТЫ):\n- ${result.npcAgencyProposals.join("\n- ")}` : "Самостоятельные действия NPC: оснований для предложений нет.",
    ].join("\n")),
  ].join("\n\n");
}
