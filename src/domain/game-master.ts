import type { CanonFact, FactionRecord, GameTurnEntry, LocationRecord, NpcRecord, PlayerCharacterState, SourceDocument, TechnicalMessageEntry, WorldState, DelayedEvent, NpcTurnChange, QuestTurnChange, WorldEnvironment, CampaignQuest } from "./types";
import { readSupabaseEnv } from "@/lib/supabase-auth";

export interface GameMasterContext {
  action: string; mode?: "ACTION" | "OPENING"; sources: SourceDocument[]; world: WorldState; character: PlayerCharacterState;
  canonFacts: CanonFact[]; npcs: NpcRecord[]; factions: FactionRecord[]; locations: LocationRecord[];
  journal: Array<GameTurnEntry | TechnicalMessageEntry>; timelineEvents: DelayedEvent[];
}
export interface GameMasterTurn {
  narration: string; campaignMemory: string; sensoryDescription: string; spatialAccounting: string;
  mechanics: string; consequences: string; resourceAccounting: string; nextAction: string;
  summary: string; worldOutcome: string; timeDeltaMinutes: number; hpDelta: number;
  newInGameDate: string; newLocationId: string | null; consequenceText: string;
  environment: WorldEnvironment; environmentReason: string; questChanges: QuestTurnChange[];
  rolls: Array<{ label: string; formula: string; result: string }>;
  npcChanges: NpcTurnChange[];
  characterChanges: {
    inventory: Array<{ action: "ADD" | "REMOVE" | "SET"; name: string; quantity: number; notes: string; certainty: "KNOWN" | "APPROXIMATE" | "UNKNOWN" }>;
    resources: Array<{ name: string; current: number | null; max: number | null; recovery: string; certainty: "KNOWN" | "APPROXIMATE" | "UNKNOWN" }>;
    conditions: Array<{ action: "ADD" | "REMOVE"; name: string }>;
    currencyDelta: { cp: number; sp: number; ep: number; gp: number; pp: number };
  };
  needsClarification: boolean; clarificationQuestion: string; stateNotes: string[];
}
export interface GameMasterResult { turn: GameMasterTurn; model: string; usage?: { input_tokens?: number; output_tokens?: number }; }
export class GameMasterError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "GameMasterError"; }
}
const turnSchema = {
  type: "object", additionalProperties: false,
  properties: {
    narration: { type: "string" }, campaignMemory: { type: "string" }, sensoryDescription: { type: "string" },
    spatialAccounting: { type: "string" }, mechanics: { type: "string" }, consequences: { type: "string" },
    resourceAccounting: { type: "string" }, nextAction: { type: "string" },
    summary: { type: "string" }, worldOutcome: { type: "string" },
    timeDeltaMinutes: { type: "integer" }, hpDelta: { type: "integer" }, newInGameDate: { type: "string" },
    consequenceText: { type: "string" },
    newLocationId: { type: ["string", "null"] },
    rolls: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      label: { type: "string" }, formula: { type: "string" }, result: { type: "string" },
    }, required: ["label", "formula", "result"] } },
    npcChanges: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      action: { type: "string", enum: ["CREATE", "UPDATE"] }, name: { type: "string" },
      role: { type: "string" }, goals: { type: "string" }, resources: { type: "string" }, attitudeToPlayer: { type: "string" },
      playerVisible: { type: "boolean" },
      locationName: { type: ["string", "null"] }, factionName: { type: ["string", "null"] },
      certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] }, reason: { type: "string" },
      knowledgeAdditions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        factSummary: { type: "string" }, acquisitionPath: { type: "string" },
        certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      }, required: ["factSummary", "acquisitionPath", "certainty"] } },
      playerKnowledgeAdditions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        factSummary: { type: "string" }, acquisitionPath: { type: "string" },
        certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      }, required: ["factSummary", "acquisitionPath", "certainty"] } },
    }, required: ["action", "name", "role", "goals", "resources", "attitudeToPlayer", "playerVisible", "locationName", "factionName", "certainty", "reason", "knowledgeAdditions", "playerKnowledgeAdditions"] } },
    environment: { type: "object", additionalProperties: false, properties: {
      temperatureC: { type: ["number", "null"] }, temperatureCertainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      weather: { type: "string" }, lighting: { type: "string" }, visibility: { type: "string" }, wind: { type: "string" },
      precipitation: { type: "string" }, ambientSounds: { type: "string" }, ambientSmells: { type: "string" }, notes: { type: "string" },
    }, required: ["temperatureC", "temperatureCertainty", "weather", "lighting", "visibility", "wind", "precipitation", "ambientSounds", "ambientSmells", "notes"] },
    environmentReason: { type: "string" },
    questChanges: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      action: { type: "string", enum: ["CREATE", "UPDATE"] }, title: { type: "string" }, description: { type: "string" },
      objectives: { type: "array", items: { type: "string" } }, status: { type: "string", enum: ["RUMOR", "ACTIVE", "ON_HOLD", "COMPLETED", "FAILED"] },
      giverName: { type: ["string", "null"] }, locationName: { type: ["string", "null"] }, deadline: { type: ["string", "null"] },
      reward: { type: "string" }, sourcePath: { type: "string" }, certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] }, reason: { type: "string" },
    }, required: ["action", "title", "description", "objectives", "status", "giverName", "locationName", "deadline", "reward", "sourcePath", "certainty", "reason"] } },
    characterChanges: { type: "object", additionalProperties: false, properties: {
      inventory: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        action: { type: "string", enum: ["ADD", "REMOVE", "SET"] }, name: { type: "string" },
        quantity: { type: "integer" }, notes: { type: "string" }, certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      }, required: ["action", "name", "quantity", "notes", "certainty"] } },
      resources: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        name: { type: "string" }, current: { type: ["integer", "null"] }, max: { type: ["integer", "null"] },
        recovery: { type: "string" }, certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      }, required: ["name", "current", "max", "recovery", "certainty"] } },
      conditions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        action: { type: "string", enum: ["ADD", "REMOVE"] }, name: { type: "string" },
      }, required: ["action", "name"] } },
      currencyDelta: { type: "object", additionalProperties: false, properties: {
        cp: { type: "integer" }, sp: { type: "integer" }, ep: { type: "integer" }, gp: { type: "integer" }, pp: { type: "integer" },
      }, required: ["cp", "sp", "ep", "gp", "pp"] },
    }, required: ["inventory", "resources", "conditions", "currencyDelta"] },
    needsClarification: { type: "boolean" }, clarificationQuestion: { type: "string" },
    stateNotes: { type: "array", items: { type: "string" } },
  },
  required: ["narration", "campaignMemory", "sensoryDescription", "spatialAccounting", "mechanics", "consequences", "resourceAccounting", "nextAction", "summary", "worldOutcome", "timeDeltaMinutes", "hpDelta", "newInGameDate", "newLocationId", "consequenceText", "environment", "environmentReason", "questChanges", "rolls", "characterChanges", "npcChanges", "needsClarification", "clarificationQuestion", "stateNotes"],
} as const;
function selectCanonContext(facts: CanonFact[], sources: SourceDocument[], action: string): string {
  const terms = action.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2);
  const canon = sources.filter((source) => source.type === "WORLD_CANON" && source.contentStatus === "ATTACHED" && source.processing?.status === "PROCESSED" && source.reviewStatus === "VERIFIED" && source.contextEnabled === true);
  type RankedExcerpt = { source: SourceDocument; sectionId: string; headingPath: string[]; text: string; startLine: number; endLine: number; score: number };
  const ranked: RankedExcerpt[] = canon.flatMap((source) => {
    if (source.canonSections?.length) {
      return source.canonSections.map((section) => {
        const haystack = `${section.headingPath.join(" ")} ${section.heading}\n${section.text}`.toLocaleLowerCase();
        return { source, sectionId: section.id, headingPath: section.headingPath, text: section.text,
          startLine: section.startLine, endLine: section.endLine,
          score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
      });
    }
    const lines = source.content.replace(/\r\n?/g, "\n").replace(/\f/g, "\n\n").split("\n");
    const paragraphs: Array<{ text: string; startLine: number; endLine: number }> = [];
    let current: string[] = [];
    let startLine = 1;
    const flush = (endLine: number) => {
      const text = current.join("\n").trim();
      if (text) paragraphs.push({ text, startLine, endLine });
      current = [];
    };
    lines.forEach((line, index) => {
      if (!line.trim()) { flush(index); startLine = index + 2; }
      else { if (current.length === 0) startLine = index + 1; current.push(line); }
    });
    flush(lines.length);
    return paragraphs.map((paragraph) => {
      const haystack = paragraph.text.toLocaleLowerCase();
      return { source, sectionId: "UNINDEXED", headingPath: [], ...paragraph,
        score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
    });
  }).sort((a, b) => b.score - a.score || a.startLine - b.startLine).slice(0, 24);
  const selectedFacts = facts
    .filter((fact) => fact.layer === "OBJECTIVE_TRUTH" && fact.certainty !== "UNKNOWN")
    .map((fact) => {
      const haystack = `${fact.title} ${fact.statement}`.toLocaleLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { fact, score };
    })
    .sort((a, b) => b.score - a.score || b.fact.createdAt.localeCompare(a.fact.createdAt))
    .slice(0, 60)
    .map(({ fact }) => `[${fact.certainty}] ${fact.title}: ${fact.statement} (источник: ${fact.sourceId})`)
    .join("\n");
  const selectedExcerpts = ranked
    .sort((a, b) => b.score - a.score || a.startLine - b.startLine)
    .filter((item) => item.score > 0)
    .slice(0, 12);
  const fallbackExcerpts = selectedExcerpts.length ? selectedExcerpts : ranked.slice(0, 6);
  return [
    fallbackExcerpts.length ? fallbackExcerpts.map((item) =>
      `[ИСТОЧНИК: ${item.source.title}; sourceId=${item.source.id}; sectionId=${item.sectionId}; строки ${item.startLine}–${item.endLine}; relevance=${item.score}]\n${item.text}`,
    ).join("\n\n") : "Релевантные фрагменты хроники не извлечены. Не заполняй пробелы выдуманным каноном.",
    selectedFacts ? `ПОДТВЕРЖДЁННЫЕ ФАКТЫ КАМПАНИИ:\n${selectedFacts}` : "",
  ].filter(Boolean).join("\n\n");
}
function selectNpcSimulationContext(sources: SourceDocument[]): string {
  const source = sources.find((item) =>
    item.type === "SUPPLEMENTAL" &&
    item.fileName === "NPC_SIMULATION_RULES_NDP_0_3.md" &&
    item.playerVisible === false &&
    item.contentStatus === "ATTACHED" &&
    item.processing?.status === "PROCESSED" &&
    item.reviewStatus === "VERIFIED" &&
    item.contextEnabled === true
  );
  return source
    ? `[GM-ONLY NPC SIMULATION REFERENCE: ${source.title}; sourceId=${source.id}]\\n${source.content}`
    : "NPC_SIMULATION_REFERENCE: UNKNOWN. Use only validated NPC records and ОБСИДИАН 4.1; do not invent an NPC decision protocol.";
}
function selectRelevantJournal(
  entries: Array<GameTurnEntry | TechnicalMessageEntry>,
  action: string,
  historicalLimit = 8,
): Array<GameTurnEntry | TechnicalMessageEntry> {
  const recent = entries.slice(-12);
  const recentIds = new Set(recent.map((entry) => entry.id));
  const terms = action.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2);
  if (!terms.length) return recent;
  const historical = entries
    .filter((entry): entry is GameTurnEntry => entry.entryType === "GAME_TURN" && !recentIds.has(entry.id))
    .map((entry) => {
      const text = [entry.summary, entry.playerIntent, entry.worldOutcome, entry.gmNarration, entry.campaignMemory].join(" ").toLocaleLowerCase();
      const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.turnNumber - a.entry.turnNumber)
    .slice(0, historicalLimit)
    .map((item) => item.entry);
  return [...historical, ...recent].sort((a, b) => {
    const aTurn = a.entryType === "GAME_TURN" ? a.turnNumber : Number.MAX_SAFE_INTEGER;
    const bTurn = b.entryType === "GAME_TURN" ? b.turnNumber : Number.MAX_SAFE_INTEGER;
    return aTurn - bTurn;
  });
}
export function selectRulesContext(sources: SourceDocument[], action: string): string {
  const verified = sources.filter((source) => {
    const label = `${source.title} ${source.originLabel} ${source.fileName ?? ""}`;
    return source.type === "SUPPLEMENTAL" &&
      /SRD\s*5\.2\.1|D&D\s*2024|DND\s*2024/i.test(label) &&
      source.contentStatus === "ATTACHED" && source.content.trim().length > 0 &&
      source.processing?.status === "PROCESSED" &&
      source.reviewStatus === "VERIFIED" && source.contextEnabled === true;
  });
  if (!verified.length) return "UNKNOWN: full SRD 5.2.1 supplemental text is not attached and enabled. Use only the built-in compact SRD digest; exact mechanics outside it require RULE UNCERTAINTY.";
  const russian = action.toLocaleLowerCase();
  const mappedTerms = [
    ...( /атак|удар|оруж|бой|инициатив/.test(russian) ? ["attack", "combat", "weapon", "initiative", "attack roll"] : []),
    ...( /урон|поврежден/.test(russian) ? ["damage", "damage roll", "resistance", "vulnerability"] : []),
    ...( /спасброс|сопротив/.test(russian) ? ["saving throw", "saving throws"] : []),
    ...( /провер|навык|характеристик/.test(russian) ? ["ability check", "d20 test", "skill"] : []),
    ...( /атлет|перепрыг|взобрат|толк|схват/.test(russian) ? ["athletics", "grapple", "shove", "jump", "climb"] : []),
    ...( /акробат|баланс/.test(russian) ? ["acrobatics", "balance"] : []),
    ...( /скрыт|незамет|прят|крад/.test(russian) ? ["stealth", "hide", "invisible"] : []),
    ...( /восприят|замет|осмотр|вниман/.test(russian) ? ["perception", "search", "study"] : []),
    ...( /прониц|намерен|чувств/.test(russian) ? ["insight"] : []),
    ...( /расслед|обыск|поиск|разобрат/.test(russian) ? ["investigation", "study", "search"] : []),
    ...( /убежд|переговор|уговор/.test(russian) ? ["persuasion", "influence", "friendly"] : []),
    ...( /запуг|угроз/.test(russian) ? ["intimidation", "influence", "hostile"] : []),
    ...( /обман|лж|маскиров/.test(russian) ? ["deception", "influence"] : []),
    ...( /истори|памят|летопис/.test(russian) ? ["history"] : []),
    ...( /арк|маг|заклин|колдов/.test(russian) ? ["arcana", "spellcasting", "spell"] : []),
    ...( /медицин|леч|стабилиз/.test(russian) ? ["medicine", "stabilize", "healing"] : []),
    ...( /выжив|следоп|след/.test(russian) ? ["survival", "tracking", "travel pace"] : []),
    ...( /живот|звер/.test(russian) ? ["animal handling"] : []),
    ...( /религ|свящ/.test(russian) ? ["religion"] : []),
    ...( /природ|растен/.test(russian) ? ["nature"] : []),
    ...( /выступ|исполн/.test(russian) ? ["performance"] : []),
    ...( /инструмент|замок|ловуш/.test(russian) ? ["tool", "thieves' tools", "utilize"] : []),
    ...( /движ|перемещ|скорост|паден|прыж|лаз|плав/.test(russian) ? ["movement", "speed", "difficult terrain", "falling"] : []),
    ...( /состояни|слеп|испуг|отрав|яд/.test(russian) ? ["condition", "conditions", "poisoned", "frightened", "blinded"] : []),
    ...( /отдых|восстанов/.test(russian) ? ["long rest", "short rest", "resting"] : []),
    ...( /перегруз|вес|грузоподъём/.test(russian) ? ["carrying capacity", "encumbrance", "push", "drag", "lift"] : []),
    ...( /смерт|умира|без созн|смерти/.test(russian) ? ["death saving throw", "dying", "stabilize"] : []),
    ...( /класс|боец|воин|особенност/.test(russian) ? ["fighter", "character classes", "class features"] : []),
  ];
  const actionTerms = action.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2);
  const terms = [...new Set([...actionTerms, ...mappedTerms].map((term) => term.toLocaleLowerCase()))];
  const excerpts: Array<{ source: SourceDocument; startLine: number; endLine: number; text: string; score: number }> = [];
  for (const source of verified) {
    const lines = source.content.replace(/\r\n?/g, "\n").replace(/\f/g, "\n\n").split("\n");
    let paragraph: string[] = [];
    let startLine = 1;
    const flush = (endLine: number) => {
      const text = paragraph.join("\n").trim();
      paragraph = [];
      if (!text) return;
      const lower = text.toLocaleLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      if (score > 0) excerpts.push({ source, startLine, endLine, text, score });
    };
    lines.forEach((line, index) => {
      if (!line.trim()) { flush(index); startLine = index + 2; }
      else { if (paragraph.length === 0) startLine = index + 1; paragraph.push(line); }
    });
    flush(lines.length);
  }
  const selected = excerpts.sort((a, b) => b.score - a.score || a.startLine - b.startLine).slice(0, 10);
  if (!selected.length) return "Verified SRD 5.2.1 source is enabled, but no relevant paragraph matched the action. RULE UNCERTAINTY: do not invent exact rule text.";
  let budget = 14000;
  const output: string[] = [];
  for (const item of selected) {
    const excerpt = item.text.slice(0, Math.min(item.text.length, budget));
    if (!excerpt) break;
    output.push(`[RULE SOURCE: ${item.source.title}; sourceId=${item.source.id}; lines ${item.startLine}–${item.endLine}]${item.text.length > excerpt.length ? " (excerpt truncated)" : ""}\n${excerpt}`);
    budget -= excerpt.length;
    if (budget <= 0) break;
  }
  return output.join("\n\n");
}
function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new GameMasterError("API вернул пустой ответ.", "EMPTY_RESPONSE");
  const record = payload as Record<string, unknown>;
  if (typeof record["output_text"] === "string") return record["output_text"] as string;
  for (const item of Array.isArray(record["output"]) ? record["output"] : []) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>)["content"];
    if (!Array.isArray(content)) continue;
    for (const part of content) if (part && typeof part === "object" &&
      (part as Record<string, unknown>)["type"] === "output_text" && typeof (part as Record<string, unknown>)["text"] === "string")
      return (part as Record<string, unknown>)["text"] as string;
  }
  throw new GameMasterError("В ответе модели нет текстового результата.", "MISSING_OUTPUT_TEXT");
}
function validateTurn(value: unknown, knownLocations: LocationRecord[], knownNpcs: NpcRecord[], knownFactions: FactionRecord[], knownQuests: CampaignQuest[] = [], contextWorldEnvironment?: WorldEnvironment): GameMasterTurn {
  if (!value || typeof value !== "object") throw new GameMasterError("Модель вернула некорректную структуру хода.", "INVALID_TURN");
  const turn = value as Record<string, unknown>;
  const strings = ["narration", "campaignMemory", "sensoryDescription", "spatialAccounting", "mechanics", "consequences", "resourceAccounting", "nextAction", "summary", "worldOutcome", "newInGameDate", "consequenceText", "clarificationQuestion"];
  if (strings.some((key) => typeof turn[key] !== "string") || !Number.isInteger(turn["timeDeltaMinutes"]) ||
    (turn["timeDeltaMinutes"] as number) < 0 || !Number.isInteger(turn["hpDelta"]) || (turn["newLocationId"] !== null && typeof turn["newLocationId"] !== "string") || typeof turn["needsClarification"] !== "boolean" ||
    !Array.isArray(turn["rolls"]) || !Array.isArray(turn["stateNotes"]))
    throw new GameMasterError("Модель вернула неполную структуру игрового хода. Ничего не сохранено.", "INVALID_TURN");
  if (!Array.isArray(turn["npcChanges"])) throw new GameMasterError("Модель не вернула обязательный список изменений NPC.", "INVALID_NPC_CHANGES");
  const environment = turn["environment"] as Record<string, unknown> | undefined;
  if (!environment || !Number.isFinite(environment["temperatureC"] === null ? 0 : environment["temperatureC"]) ||
      !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(environment["temperatureCertainty"])) ||
      ["weather", "lighting", "visibility", "wind", "precipitation", "ambientSounds", "ambientSmells", "notes"].some((key) => typeof environment[key] !== "string") ||
      typeof turn["environmentReason"] !== "string" || !(turn["environmentReason"] as string).trim() ||
      (environment["temperatureC"] === null && environment["temperatureCertainty"] === "KNOWN") ||
      (environment["temperatureC"] !== null && environment["temperatureCertainty"] === "UNKNOWN")) {
    throw new GameMasterError("Мастер не вернул полный блок текущего окружения.", "INVALID_ENVIRONMENT");
  }
  if (!Array.isArray(turn["questChanges"])) throw new GameMasterError("Мастер не вернул список изменений журнала заданий.", "INVALID_QUEST_CHANGES");
  for (const quest of turn["questChanges"] as Array<Record<string, unknown>>) {
    if (!["CREATE", "UPDATE"].includes(String(quest["action"])) || typeof quest["title"] !== "string" || !quest["title"].trim() ||
        typeof quest["description"] !== "string" || !Array.isArray(quest["objectives"]) || quest["objectives"].some((item) => typeof item !== "string") ||
        !["RUMOR", "ACTIVE", "ON_HOLD", "COMPLETED", "FAILED"].includes(String(quest["status"])) ||
        (quest["giverName"] !== null && typeof quest["giverName"] !== "string") || (quest["locationName"] !== null && typeof quest["locationName"] !== "string") ||
        (quest["deadline"] !== null && typeof quest["deadline"] !== "string") || typeof quest["reward"] !== "string" ||
        typeof quest["sourcePath"] !== "string" || !quest["sourcePath"].trim() ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(quest["certainty"])) || typeof quest["reason"] !== "string") {
      throw new GameMasterError("Некорректная запись журнала заданий.", "INVALID_QUEST_CHANGE");
    }
    const existingQuest = knownQuests.find((item) => item.title.toLocaleLowerCase() === (quest["title"] as string).toLocaleLowerCase());
    if (quest["action"] === "CREATE" && existingQuest) throw new GameMasterError(`Задание «${quest["title"]}» уже есть в журнале; используй UPDATE.`, "DUPLICATE_QUEST");
    if (quest["action"] === "UPDATE" && !existingQuest) throw new GameMasterError(`Нельзя обновить неизвестное персонажа задание «${quest["title"]}».`, "UNKNOWN_QUEST_UPDATE");
  }
  for (const npc of turn["npcChanges"] as Array<Record<string, unknown>>) {
    if (!["CREATE", "UPDATE"].includes(String(npc["action"])) || typeof npc["name"] !== "string" || !npc["name"].trim() ||
        typeof npc["role"] !== "string" || typeof npc["goals"] !== "string" || typeof npc["resources"] !== "string" || typeof npc["attitudeToPlayer"] !== "string" || typeof npc["playerVisible"] !== "boolean" ||
        (npc["locationName"] !== null && typeof npc["locationName"] !== "string") ||
        (npc["factionName"] !== null && typeof npc["factionName"] !== "string") ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(npc["certainty"])) ||
        typeof npc["reason"] !== "string" || !Array.isArray(npc["knowledgeAdditions"]) || !Array.isArray(npc["playerKnowledgeAdditions"])) {
      throw new GameMasterError("Некорректное изменение NPC в ответе мастера.", "INVALID_NPC_CHANGE");
    }
    const existingNpc = knownNpcs.find((item) => item.name.toLocaleLowerCase() === (npc["name"] as string).toLocaleLowerCase());
    if (npc["action"] === "CREATE" && existingNpc) {
      throw new GameMasterError("Мастер попытался создать дубликат NPC «" + npc["name"] + "». Для существующего персонажа используй UPDATE.", "DUPLICATE_NPC");
    }
    if (npc["action"] === "UPDATE" && !existingNpc) {
      throw new GameMasterError("Мастер пытается обновить неизвестного NPC «" + npc["name"] + "».", "UNKNOWN_NPC_UPDATE");
    }
    if (npc["action"] === "UPDATE" && existingNpc?.locked) {
      throw new GameMasterError("NPC «" + npc["name"] + "» закреплён и защищён от изменений. Сначала проверь его карточку и разблокируй вручную.", "LOCKED_NPC_CHANGE");
    }
    if (npc["locationName"] !== null && !knownLocations.some((item) => item.name.toLocaleLowerCase() === (npc["locationName"] as string).toLocaleLowerCase())) {
      throw new GameMasterError("Для NPC «" + npc["name"] + "» указана неизвестная локация.", "UNKNOWN_NPC_LOCATION");
    }
    if (npc["factionName"] !== null && !knownFactions.some((item) => item.name.toLocaleLowerCase() === (npc["factionName"] as string).toLocaleLowerCase())) {
      throw new GameMasterError("Для NPC «" + npc["name"] + "» указана неизвестная фракция.", "UNKNOWN_NPC_FACTION");
    }
    for (const knowledge of [...npc["knowledgeAdditions"] as Array<Record<string, unknown>>, ...npc["playerKnowledgeAdditions"] as Array<Record<string, unknown>>]) {
      if (typeof knowledge["factSummary"] !== "string" || !knowledge["factSummary"].trim() ||
          typeof knowledge["acquisitionPath"] !== "string" || !knowledge["acquisitionPath"].trim() ||
          !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(knowledge["certainty"]))) {
        throw new GameMasterError("Некорректная запись знания NPC.", "INVALID_NPC_KNOWLEDGE");
      }
    }
  }
  if (typeof turn["newLocationId"] === "string" && !knownLocations.some((location) => location.id === turn["newLocationId"])) {
    throw new GameMasterError("Мастер указал локацию, которой нет в подтверждённом реестре. Сначала добавьте её в раздел «Время и карта».", "UNKNOWN_LOCATION_ID");
  }
  const changes = turn["characterChanges"] as Record<string, unknown> | undefined;
  if (!changes || !Array.isArray(changes["inventory"]) || !Array.isArray(changes["resources"]) ||
      !Array.isArray(changes["conditions"]) || !changes["currencyDelta"] || typeof changes["currencyDelta"] !== "object") {
    throw new GameMasterError("Модель не вернула обязательный блок изменений состояния персонажа.", "INVALID_CHARACTER_CHANGES");
  }
  for (const item of changes["inventory"] as Array<Record<string, unknown>>) {
    if (!["ADD", "REMOVE", "SET"].includes(String(item["action"])) || typeof item["name"] !== "string" ||
        !item["name"].trim() || !Number.isInteger(item["quantity"]) ||
        (item["action"] === "SET" ? (item["quantity"] as number) < 0 : (item["quantity"] as number) < 1) ||
        typeof item["notes"] !== "string" || !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(item["certainty"]))) {
      throw new GameMasterError("Некорректное изменение инвентаря в ответе мастера.", "INVALID_INVENTORY_CHANGE");
    }
  }
  for (const resource of changes["resources"] as Array<Record<string, unknown>>) {
    if (typeof resource["name"] !== "string" || !resource["name"].trim() ||
        (resource["current"] !== null && (!Number.isInteger(resource["current"]) || (resource["current"] as number) < 0)) ||
        (resource["max"] !== null && (!Number.isInteger(resource["max"]) || (resource["max"] as number) < 0)) ||
        (resource["current"] !== null && resource["max"] !== null && (resource["current"] as number) > (resource["max"] as number)) ||
        typeof resource["recovery"] !== "string" ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(resource["certainty"]))) {
      throw new GameMasterError("Некорректное изменение ресурса в ответе мастера.", "INVALID_RESOURCE_CHANGE");
    }
  }
  const currency = changes["currencyDelta"] as Record<string, unknown>;
  for (const coin of ["cp", "sp", "ep", "gp", "pp"]) {
    if (!Number.isInteger(currency[coin])) throw new GameMasterError("Некорректное изменение валюты.", "INVALID_CURRENCY_CHANGE");
  }
  for (const condition of changes["conditions"] as Array<Record<string, unknown>>) {
    if (!["ADD", "REMOVE"].includes(String(condition["action"])) || typeof condition["name"] !== "string" || !condition["name"].trim()) {
      throw new GameMasterError("Некорректное изменение состояния персонажа.", "INVALID_CONDITION_CHANGE");
    }
  }
  for (const roll of turn["rolls"] as Array<Record<string, unknown>>) {
    if (typeof roll["label"] !== "string" || typeof roll["formula"] !== "string" ||
        roll["result"] !== "ОЖИДАЕТСЯ БРОСОК ИГРОКА") {
      throw new GameMasterError("Мастер попытался подставить результат броска. Все игровые броски выполняет игрок; ход не принят.", "GM_INVENTED_DICE_RESULT");
    }
  }
  const rolls = turn["rolls"] as Array<Record<string, unknown>>;
  const hasPendingRoll = rolls.length > 0;
  if (rolls.length > 1) throw new GameMasterError("Для надёжного разрешения мастер запрашивает только один бросок за раз.", "MULTIPLE_PENDING_ROLLS");
  if (turn["needsClarification"] && !(turn["clarificationQuestion"] as string).trim()) {
    throw new GameMasterError("Мастер отметил необходимость уточнения, но не задал вопрос.", "MISSING_CLARIFICATION_QUESTION");
  }
  const hasCharacterDelta = (changes["inventory"] as unknown[]).length > 0 ||
    (changes["resources"] as unknown[]).length > 0 || (changes["conditions"] as unknown[]).length > 0 ||
    Object.values(currency).some((amount) => amount !== 0);
  const baseEnvironment = contextWorldEnvironment ?? null;
  const returnedEnvironment = environment as Record<string, unknown>;
  const hasEnvironmentDelta = baseEnvironment
    ? Object.entries(baseEnvironment).some(([key, value]) => returnedEnvironment[key] !== value)
    : Object.entries(returnedEnvironment).some(([key, value]) => key === "temperatureC" ? value !== null : key === "temperatureCertainty" ? value !== "UNKNOWN" : key === "notes" ? value !== "" : value !== "UNKNOWN");
  const hasWorldDelta = (turn["npcChanges"] as unknown[]).length > 0 || (turn["questChanges"] as unknown[]).length > 0 ||
    turn["newLocationId"] !== null || (turn["consequenceText"] as string).trim().length > 0 || hasEnvironmentDelta;
  if ((turn["needsClarification"] || hasPendingRoll) && (
    (turn["timeDeltaMinutes"] as number) !== 0 || (turn["hpDelta"] as number) !== 0 ||
    hasCharacterDelta || hasWorldDelta
  )) {
    throw new GameMasterError("При ожидаемом броске или уточнении мастер не может фиксировать время, HP, предметы, ресурсы, NPC, локацию или последствия.", "INVALID_CLARIFICATION_DELTA");
  }
  return turn as unknown as GameMasterTurn;
}
function parseTechnicalDateTime(value: string): number | null {
  const match = value.match(/(?:^|\D)(\d{1,4})\s*(?:год)?\s*,?\s*месяц\s*(\d{1,2})\s*,?\s*день\s*(\d{1,2})\s*[;, ]+([01]\d|2[0-3]):([0-5]\d)/i);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]);
  if (month < 1 || month > 13 || day < 1 || (month <= 12 ? day > 30 : day > 5)) return null;
  const ordinal = month <= 12 ? (month - 1) * 30 + day : 360 + day;
  return year * 365 * 1440 + (ordinal - 1) * 1440 + hour * 60 + minute;
}

export async function resolvePlayerAction(sessionToken: string, context: GameMasterContext,
  options: { model?: string; fetcher?: typeof fetch; supabaseUrl?: string; publishableKey?: string } = {}): Promise<GameMasterResult> {
  if (!sessionToken.trim()) throw new GameMasterError("Войди в аккаунт, чтобы использовать игрового мастера.", "AUTH_REQUIRED");
  const envResult = readSupabaseEnv();
  const supabaseUrl = options.supabaseUrl ?? (envResult.ok ? envResult.config.url : "");
  const publishableKey = options.publishableKey ?? (envResult.ok ? envResult.config.publishableKey : "");
  if (!supabaseUrl || !publishableKey) throw new GameMasterError("Не настроено подключение к защищённому серверу Supabase.", "SUPABASE_CONFIG_MISSING");
  if (context.mode !== "OPENING" && !context.action.trim()) throw new GameMasterError("Действие персонажа не может быть пустым.", "EMPTY_ACTION");
  const governing = context.sources.find((source) =>
    source.type === "GOVERNING_DOC" && source.serverManaged === true
  );
  if (!governing) throw new GameMasterError(
    "ОБСИДИАН 4.1 должен быть настроен в закрытом серверном хранилище мастера.",
    "GOVERNING_SOURCE_NOT_READY",
  );
  const dossier = context.sources.find((source) =>
    source.type === "PLAYER_DOSSIER" && source.contentStatus === "ATTACHED" &&
    source.processing?.status === "PROCESSED" && source.reviewStatus === "VERIFIED" && source.contextEnabled === true
  );
  if (!dossier && context.character.sourceDossierId !== "GENERATED_RANDOM") throw new GameMasterError(
    "Лист персонажа должен быть загружен, проверен и разрешён для текущей кампании.",
    "PLAYER_DOSSIER_NOT_READY",
  );
  const openingContextQuery = `${context.world.startLocationName} ${context.world.calendarSystem} ${context.world.startNarrative ?? ""} стартовая локация город регион окружение`;
  const contextQuery = context.mode === "OPENING" ? openingContextQuery : context.action;
  const verifiedRulesContext = "Полный SRD 5.2.1 хранится отдельно и извлекается сервером по контексту действия. Текст правил не передаётся браузеру.";
  const system = [
    "Ты — игровой мастер-симулятор живого мира D&D 5e редакции 2024 в кампании ОБСИДИАН.",
    "Полный управляющий документ ОБСИДИАН 4.1 добавляется сервером из закрытого хранилища; не заменяй и не переопределяй его.",
    "Полный текст ОБСИДИАН 4.1 подключён на сервере и не передаётся браузеру.",
    "=== ЭПИСТЕМИЧЕСКИЕ И КАНОНИЧЕСКИЕ ОГРАНИЧЕНИЯ ===",
    "Различай объективную истину, знания персонажа, знания каждого NPC и OOC. NPC не всеведущи. Не добавляй неподтверждённые факты Экдрасиля. При неизвестности используй UNKNOWN, при приблизительности APPROXIMATE. Досье персонажа не является каноном мира.",
    "Игрок может пытаться совершать любые действия. Не запрещай их произвольно: оцени физическую возможность, механику, риски и последствия.",
    "Кампания является свободной песочницей. Не назначай персонажу квест, поручение, обязательную встречу, пророчество или сюжетную цель по собственной инициативе. Не создавай искусственную завязку, которая требует следовать одному маршруту. NPC могут иметь собственные дела и цели, а мир может развиваться независимо; игрок сам решает, с чем взаимодействовать.",
    "Если в campaign.startNarrative содержится сгенерированная стартовая ситуация, считай её исходным состоянием текущего прохождения. Не переиначивай её задним числом. Не превращай бытовую сцену в квест. Развивай только последствия действий игрока и причинно обоснованные события мира.",
    "Не выдумывай результаты бросков. Если нужна проверка, укажи её в rolls с формулой и результатом 'ОЖИДАЕТСЯ БРОСОК ИГРОКА'; не разрешай исход до получения результата. Не бросай за игрока.",
    "Если действие требует уточнения, не продвигай время и не фиксируй последствия; задай один конкретный вопрос в clarificationQuestion.",
    ...(context.mode === "OPENING" ? [
      "СПЕЦИАЛЬНЫЙ РЕЖИМ OPENING: это служебный запрос на вступительную сцену, а не действие персонажа и не игровой ход. Используй campaign.startNarrative как подтверждённую стартовую ситуацию текущего прохождения: не меняй её смысл и не выдумывай предысторию. Описывай только доступную персонажа обстановку, опираясь на подтверждённые источники и зарегистрированную стартовую локацию. Не заставляй персонажа двигаться, говорить, выбирать или совершать действия. Не создавай квест, поручение, заказчика, обязательную встречу, угрозу, таймер, новый NPC, фракцию, локацию или факт. Не продвигай игровое время и не меняй дату, HP, предметы, деньги, ресурсы, состояния, NPC или состояние мира.",
      "Вступление должно начинаться заголовком «ХОД #0001 · НАЧАЛО КАМПАНИИ». Полностью заполни обязательные блоки ОБСИДИАН 4.1. Игровой год, месяц, день, день недели, время, время суток, погоду, освещение и точную локацию бери только из подтверждённых данных; если данных нет — укажи НЕ УСТАНОВЛЕНО / UNKNOWN. Заверши открытым вопросом «Что делает персонаж?».",
    ] : []),
    "Правила D&D 2024 / SRD 5.2.1 загружаются и извлекаются сервером из закрытого хранилища. Браузер не содержит полный текст SRD и не выбирает фрагменты правил. Не смешивай редакции 2014 и 2024. Если сервер не передал конкретное правило, верни RULE UNCERTAINTY и не выдумывай параметры.",
    "При проверке D20 учитывай модификатор характеристики, владение, преимущество/помеху, Exhaustion 2024 и другие подтверждённые эффекты ровно один раз. DC фиксируй до броска. Не трактуй натуральные 1/20 как универсальные автоматические провал/успех.",
    "Проверяй Action, Bonus Action, Reaction, движение, концентрацию, состояния, сопротивления/уязвимости/иммунитеты, свойства оружия и Weapon Mastery по конкретным правилам. Не подменяй правила описанием от себя.",
    "Перед изменением HP, предметов, денег, зарядов, ячеек, классовых ресурсов, состояний и времени проверь допустимость операции и её причинное основание. Если точное правило не подтверждено, не применяй изменение. Если текущее значение ресурса персонажа UNKNOWN/null, не расходуй и не восстанавливай его по догадке: сначала задай один вопрос о фактическом остатке; ход не продвигай.",
    "Выводи только JSON по заданной схеме. Не включай markdown.",
  ].join("\n\n");
  const user = {
    mode: context.mode ?? "ACTION",
    action: context.mode === "OPENING" ? "Служебный запрос мастеру: сформируй вступительную сцену кампании, не являющуюся действием персонажа." : context.action,
    campaign: context.world, playerCharacterState: context.character,
    playerDossier: dossier?.content ?? "UNKNOWN: отдельное досье персонажа не загружено.",
    verifiedRulesReference: verifiedRulesContext,
    relevantEkdrasilCanon: selectCanonContext(context.canonFacts, context.sources, contextQuery),
    npcSimulationReference: selectNpcSimulationContext(context.sources),
    knownNpcs: context.npcs, knownFactions: context.factions, knownLocations: context.locations, scheduledAndDelayedEvents: context.timelineEvents,
    // Compact chronicle index includes every committed game turn; recentJournal
    // separately carries full detail for recent and query-matched historical turns.
    fullCampaignChronicle: context.journal
      .filter((entry): entry is GameTurnEntry => entry.entryType === "GAME_TURN")
      .map((entry) => ({
        turnNumber: entry.turnNumber,
        inGameDate: entry.inGameDateAfter,
        summary: entry.summary.slice(0, 500),
        playerIntent: entry.playerIntent.slice(0, 500),
        worldOutcome: entry.worldOutcome.slice(0, 700),
        campaignMemory: entry.campaignMemory.slice(0, 900),
      })),
    recentJournal: selectRelevantJournal(context.journal, context.action),
    requirements: [
      ...(context.mode === "OPENING" ? [
        "Это начальная сцена кампании и служебное открытие мира. Она фиксируется как игровой ход #0001, но не является действием персонажа: summary = «Начало кампании — вступительная сцена»; worldOutcome = «Вступительная сцена представлена игроку; действие персонажа ещё не совершено»; consequenceText = пустая строка.",
        "Все изменения строго нулевые: timeDeltaMinutes=0, hpDelta=0, newInGameDate в точности равна campaign.currentInGameDate, newLocationId=null, rolls=[], npcChanges=[], questChanges=[], environment в точности повторяет campaign.environment или сохраняет UNKNOWN для неизвестных полей, characterChanges содержит пустые массивы и нулевую currencyDelta.",
        "Не придумывай новые сведения о мире, NPC, фракциях, истории или событиях. Используй startNarrative и подтверждённые источники. Неизвестные поля оставь UNKNOWN/НЕ УСТАНОВЛЕНО.",
        "campaignMemory отражает только подтверждённую стартовую ситуацию и релевантные известные сведения. sensoryDescription — только сенсорная информация, которую персонаж может воспринимать в этой стартовой сцене. spatialAccounting не выдумывает позиции и расстояния. mechanics указывает, что проверка не требуется, поскольку персонаж ещё не совершал действия. nextAction задаёт открытый вопрос без навязывания вариантов."
      ] : []),
      "Верни отдельные обязательные блоки campaignMemory, sensoryDescription, spatialAccounting, mechanics, consequences, resourceAccounting и nextAction. narration — только описание сцены.",
      "Не придумывай дату, погоду, освещение, температуру, точные расстояния, позиции или параметры. Если поле неизвестно, явно напиши НЕ УСТАНОВЛЕНО/UNKNOWN; приблизительное пометь APPROXIMATE. Используй календарь campaign.calendarSystem. Для Technical Calendar 1.0 рассчитывай год/месяц/день/порядковый день года/неделю/день недели строго из даты; не придумывай названия месяцев. Время продвигай на фактическую длительность действия, а не на один чат-ответ.",
      "Верни environment как полное текущее состояние окружающей среды: измеримая температура °C или null, certainty, погода, освещение, видимость, ветер, осадки, слышимые фоновые звуки и запахи. Не меняй неизменившиеся поля без причины. Изменения среды должны иметь причинное основание: время суток, место, высота, погода, сезон, укрытие или событие; environmentReason объясняет, почему состояние осталось прежним или изменилось. Не выдумывай числовую температуру: если нет источника/основания, temperatureC=null и certainty=UNKNOWN.",
      "Журнал заданий содержит только поручения, слухи, обещания, цели или обязательства, которые персонаж действительно узнала через наблюдение, документ, разговор или иной установленный канал. Не создавай квест ради сюжета. Не превращай случайную сцену в задание. CREATE — только при первом фактическом обнаружении; UPDATE — только существующей записи. sourcePath обязателен и описывает конкретный канал получения информации. Не раскрывай скрытые задачи NPC, о которых персонаж не знает.",
      "Журнал знаний NPC — это знания персонажа о NPC, не знания самого NPC. playerVisible=true только если персонаж лично увидела/услышала NPC или узнала о нём по конкретному каналу. playerKnowledgeAdditions — только факты, реально известные персонажа; sourcePath/acquisitionPath обязателен. knowledgeAdditions — отдельно то, что знает сам NPC. Не смешивай эти два набора. Если персонаж видит незнакомца, можно создать открытую запись с UNKNOWN-личностью и только наблюдаемыми деталями.",
      "sensoryDescription содержит только то, что персонаж реально воспринимает; если новых ощущений нет, так и напиши.",
      "spatialAccounting показывает только известные позиции, расстояния и препятствия; не выводи точные расстояния из художественного описания.",
      "mechanics указывает применённое правило/источник, проверку, модификатор, преимущество/помеху, DC/AC и результат; если бросок не нужен, объясни почему.",
      "resourceAccounting показывает затронутые ресурсы и явно отмечает, если изменений нет. nextAction заканчивается открытым вопросом без навязывания вариантов.",
      "Ответ должен быть на русском языке.",
      "В mechanics указывай точное правило/источник SRD 5.2.1 или ID подтверждённого rule source. Если покрытие домена REFERENCE_REQUIRED и текст конкретного правила не передан, явно укажи RULE UNCERTAINTY и не выдумывай DC, урон, дальность, длительность, стоимость действия или эффект.",
      "Если подтверждённый источник SRD 5.2.1 прикреплён, сверяй конкретные правила с его текстом; при конфликте с более ранним пересказом используй подтверждённый SRD и сообщи о конфликте. Если источник не прикреплён, используй только встроенные базовые формулы и отмечай остальные правила как RULE UNCERTAINTY.",
      "Не заявляй, что вся система D&D 2024 полностью закодирована. Базовые формулы можно применять из встроенного реестра; классовые таблицы, полные описания заклинаний/предметов/монстров, состояния и ситуативные правила сверяй с переданным источником.",
      "Это свободная кампания: не подсовывай игроку задания и не формулируй обязательную цель. Завершай сцену открытым состоянием мира, а не списком квестов. События и предложения NPC допустимы только как естественные последствия их собственных целей и обстоятельств; игрок свободен проигнорировать их.",
      "В summary/worldOutcome записывай только произошедшее, не предположения.",
      "Если бросок ожидается, timeDeltaMinutes и hpDelta равны 0, worldOutcome сообщает, что исход ожидает броска.",
      "newInGameDate оставь текущей датой, если время не продвинулось. newLocationId меняй только если персонаж фактически прибыл в зарегистрированную локацию из knownLocations; не телепортируй и не выдумывай ID.",
      "npcChanges содержит только NPC, реально впервые представленных или чьё состояние/знание изменилось в этой сцене. CREATE только для нового встреченного NPC, UPDATE только для уже существующего из knownNpcs. Не создавай дубликаты. locationName и factionName — только точные имена из knownLocations/knownFactions или null. knowledgeAdditions — только сведения, которые конкретный NPC получил через описанный канал; не делай NPC всеведущими. reason объясняет источник изменения. Если изменений нет — пустой массив.",
      "npcSimulationReference — GM-only протокол принятия решений и ведения NPC, а не источник фактов мира. Следуй ему для устойчивых целей, временного состояния, планов, задач, знаний и ресурсов. Не копируй шаблонные примеры как факты текущего NPC; текущие записи knownNpcs имеют приоритет как состояние.",
      "Поля goals, attitudeToPlayer, knowledge, resources и внутренние планы в knownNpcs могут содержать GM-only сведения. Используй их только для симуляции поведения NPC. Не раскрывай их персонажа, пока она не получила соответствующую информацию через установленный внутриигровой канал. Знание NPC не является знанием персонажа игрока.",
      "characterChanges отражает только реальные изменения ресурсов, предметов, состояний и денег; если изменений нет, верни пустые массивы и нулевые currencyDelta. Не выдумывай вес предметов и не выводи текущие остатки ресурсов из их максимума.",
      "Учитывай scheduledAndDelayedEvents: событие срабатывает только при пересечении его подтверждённого срока/условия. Не запускай его раньше и не игнорируй при пересечении. Если точный формат даты неизвестен, не угадывай — оставь событие ожидающим уточнения.",
      "stateNotes содержит важные изменения/неизвестности, но не подменяет канон.",
    ],
  };
  const model = options.model ?? "obsidian-free";
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/obsidian-gm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken.trim()}`,
        apikey: publishableKey,
      },
      body: JSON.stringify({ model, instructions: system, input: JSON.stringify(user),
        text: { format: { type: "json_schema", name: "obsidian_game_turn", strict: true, schema: turnSchema } } }),
    });
  } catch { throw new GameMasterError("Не удалось подключиться к API модели. Проверь интернет-соединение.", "NETWORK_ERROR"); }
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const err = payload && typeof payload === "object" ? (payload as Record<string, unknown>)["error"] : null;
    const detail = err && typeof err === "object" && typeof (err as Record<string, unknown>)["message"] === "string"
      ? (err as { message: string }).message : "API отклонил запрос.";
    throw new GameMasterError(detail, "MODEL_API_ERROR");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(extractOutputText(payload)); }
  catch (error) { if (error instanceof GameMasterError) throw error; throw new GameMasterError("Модель вернула невалидный JSON. Ничего не сохранено.", "INVALID_JSON"); }
  const record = payload as Record<string, unknown>;
  const usage = record["usage"] && typeof record["usage"] === "object" ? record["usage"] as GameMasterResult["usage"] : undefined;
  const turn = validateTurn(parsed, context.locations, context.npcs, context.factions, context.world.quests ?? [], context.world.environment);
  if (/technical calendar 1\.0/i.test(context.world.calendarSystem)) {
    const before = parseTechnicalDateTime(context.world.currentInGameDate);
    const after = parseTechnicalDateTime(turn.newInGameDate);
    if (before !== null && (after === null || after - before !== turn.timeDeltaMinutes)) {
      throw new GameMasterError("Новая дата/время не совпадает с длительностью действия по Technical Calendar 1.0. Ход не принят.", "CALENDAR_DELTA_MISMATCH");
    }
  }
  if (context.mode === "OPENING") {
    const c = turn.characterChanges;
    const currencyChanged = Object.values(c.currencyDelta).some((amount) => amount !== 0);
    if (turn.needsClarification || turn.rolls.length > 0 || turn.timeDeltaMinutes !== 0 || turn.hpDelta !== 0 ||
      turn.newInGameDate !== context.world.currentInGameDate || turn.newLocationId !== null ||
      turn.consequenceText.trim().length > 0 || turn.npcChanges.length > 0 || turn.questChanges.length > 0 ||
      (context.world.environment !== undefined && Object.entries(context.world.environment).some(([key, value]) => turn.environment[key as keyof WorldEnvironment] !== value)) ||
      c.inventory.length > 0 || c.resources.length > 0 || c.conditions.length > 0 || currencyChanged) {
      throw new GameMasterError("Вступление попыталось изменить состояние кампании. Изменения отклонены.", "OPENING_MUTATION_REJECTED");
    }
  }
  return { turn, model, ...(usage ? { usage } : {}) };
}
