import type { CanonFact, FactionRecord, GameTurnEntry, LocationRecord, NpcRecord, PlayerCharacterState, SourceDocument, TechnicalMessageEntry, WorldChangeSet, WorldState } from "./types";

export interface GameMasterContext {
  action: string; sources: SourceDocument[]; world: WorldState; character: PlayerCharacterState;
  canonFacts: CanonFact[]; npcs: NpcRecord[]; factions: FactionRecord[]; locations: LocationRecord[];
  journal: Array<GameTurnEntry | TechnicalMessageEntry>;
}
export interface GameMasterTurn {
  narration: string; summary: string; worldOutcome: string; timeDeltaMinutes: number; hpDelta: number;
  newInGameDate: string; newLocationId: string | null; newLocationKey: string | null; consequenceText: string;
  rolls: Array<{ label: string; formula: string; result: string }>;
  characterChanges: {
    inventory: Array<{ action: "ADD" | "REMOVE" | "SET"; name: string; quantity: number; notes: string; certainty: "KNOWN" | "APPROXIMATE" | "UNKNOWN" }>;
    resources: Array<{ name: string; current: number | null; max: number | null; recovery: string; certainty: "KNOWN" | "APPROXIMATE" | "UNKNOWN" }>;
    conditions: Array<{ action: "ADD" | "REMOVE"; name: string }>;
    currencyDelta: { cp: number; sp: number; ep: number; gp: number; pp: number };
  };
  worldChanges: WorldChangeSet;
  needsClarification: boolean; clarificationQuestion: string; stateNotes: string[];
}
export interface GameMasterResult { turn: GameMasterTurn; model: string; usage?: { input_tokens?: number; output_tokens?: number }; }
export class GameMasterError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "GameMasterError"; }
}
const turnSchema = {
  type: "object", additionalProperties: false,
  properties: {
    narration: { type: "string" }, summary: { type: "string" }, worldOutcome: { type: "string" },
    timeDeltaMinutes: { type: "integer" }, hpDelta: { type: "integer" }, newInGameDate: { type: "string" },
    consequenceText: { type: "string" },
    rolls: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      label: { type: "string" }, formula: { type: "string" }, result: { type: "string" },
    }, required: ["label", "formula", "result"] } },
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
    worldChanges: { type: "object", additionalProperties: false, properties: {
      facts: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        title: { type: "string" }, statement: { type: "string" }, rationale: { type: "string" },
        layer: { type: "string", enum: ["OBJECTIVE_TRUTH", "PLAYER_KNOWLEDGE", "OUT_OF_GAME"] },
        subjectNpcId: { type: ["string", "null"] }, certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
        scope: { type: "string", enum: ["GLOBAL", "REGION", "LOCATION", "FACTION", "PERSONAL"] },
      }, required: ["title", "statement", "rationale", "layer", "subjectNpcId", "certainty", "scope"] } },
      npcUpdates: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        npcId: { type: "string" }, role: { type: ["string", "null"] }, locationId: { type: ["string", "null"] },
        factionId: { type: ["string", "null"] }, goals: { type: ["string", "null"] }, attitudeToPlayer: { type: ["string", "null"] },
        certainty: { type: ["string", "null"], enum: ["KNOWN", "APPROXIMATE", "UNKNOWN", null] }, reason: { type: "string" },
      }, required: ["npcId", "role", "locationId", "factionId", "goals", "attitudeToPlayer", "certainty", "reason"] } },
      npcKnowledgeAdditions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        npcId: { type: "string" }, factSummary: { type: "string" }, sourceId: { type: "string" },
        acquisitionPath: { type: "string" }, certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      }, required: ["npcId", "factSummary", "sourceId", "acquisitionPath", "certainty"] } },
      newLocations: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        tempId: { type: "string" }, name: { type: "string" }, region: { type: "string" }, description: { type: "string" },
        certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] }, sourceId: { type: "string" },
        distanceFromCurrent: { type: "string" }, travelTimeHours: { type: ["number", "null"] },
        routeCertainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] }, routeNotes: { type: "string" },
      }, required: ["tempId", "name", "region", "description", "certainty", "sourceId", "distanceFromCurrent", "travelTimeHours", "routeCertainty", "routeNotes"] } },
      newNpcs: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        tempId: { type: "string" }, name: { type: "string" }, role: { type: "string" },
        locationId: { type: ["string", "null"] }, factionId: { type: ["string", "null"] },
        goals: { type: "string" }, attitudeToPlayer: { type: "string" }, certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      }, required: ["tempId", "name", "role", "locationId", "factionId", "goals", "attitudeToPlayer", "certainty"] } },
      factionUpdates: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        factionId: { type: "string" }, goals: { type: ["string", "null"] }, resources: { type: ["string", "null"] },
        standing: { type: ["string", "null"] }, certainty: { type: ["string", "null"], enum: ["KNOWN", "APPROXIMATE", "UNKNOWN", null] },
        reason: { type: "string" },
      }, required: ["factionId", "goals", "resources", "standing", "certainty", "reason"] } },
      newFactions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        tempId: { type: "string" }, name: { type: "string" }, goals: { type: "string" },
        resources: { type: "string" }, standing: { type: "string" }, certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      }, required: ["tempId", "name", "goals", "resources", "standing", "certainty"] } },
      delayedEvents: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        title: { type: "string" }, triggerInGameDate: { type: "string" }, consequence: { type: "string" },
        status: { type: "string", enum: ["SCHEDULED", "TRIGGERED", "RESOLVED"] },
        certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      }, required: ["title", "triggerInGameDate", "consequence", "status", "certainty"] } },
    }, required: ["facts", "npcUpdates", "npcKnowledgeAdditions", "newLocations", "newNpcs", "factionUpdates", "newFactions", "delayedEvents"] },
    needsClarification: { type: "boolean" }, clarificationQuestion: { type: "string" },
    stateNotes: { type: "array", items: { type: "string" } },
  },
  required: ["narration", "summary", "worldOutcome", "timeDeltaMinutes", "hpDelta", "newInGameDate", "newLocationId", "newLocationKey", "consequenceText", "rolls", "characterChanges", "worldChanges", "needsClarification", "clarificationQuestion", "stateNotes"],
} as const;
function selectCanonContext(facts: CanonFact[], sources: SourceDocument[], action: string): string {
  const terms = action.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2);
  const canon = sources.filter((source) => source.type === "WORLD_CANON" && source.contentStatus === "ATTACHED");
  const ranked = canon.flatMap((source) => {
    const lines = source.content.replace(/\r\n?/g, "\n").split("\n");
    const paragraphs: Array<{ text: string; startLine: number; endLine: number }> = [];
    let current: string[] = [];
    let startLine = 1;
    const flush = (endLine: number) => {
      const text = current.join("\n").trim();
      if (text) paragraphs.push({ text, startLine, endLine });
      current = [];
    };
    lines.forEach((line, index) => {
      if (!line.trim()) {
        flush(index);
        startLine = index + 2;
      } else {
        if (current.length === 0) startLine = index + 1;
        current.push(line);
      }
    });
    flush(lines.length);
    return paragraphs.map((paragraph) => ({
      source, ...paragraph,
      score: terms.reduce((score, term) => score + (paragraph.text.toLocaleLowerCase().includes(term) ? 1 : 0), 0),
    }));
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  const factText = facts.filter((fact) => fact.layer === "OBJECTIVE_TRUTH" && fact.certainty !== "UNKNOWN")
    .slice(0, 30).map((fact) => `[${fact.certainty}] ${fact.title}: ${fact.statement} (источник: ${fact.sourceId})`).join("\n");
  return [
    ranked.length ? ranked.map((item) =>
      `[ИСТОЧНИК: ${item.source.title}; sourceId=${item.source.id}; строки ${item.startLine}–${item.endLine}]\n${item.text}`,
    ).join("\n\n") : "Релевантные фрагменты хроники по запросу не найдены. Не заполняй пробелы выдуманным каноном.",
    factText ? `ПОДТВЕРЖДЁННЫЕ ФАКТЫ КАМПАНИИ:\n${factText}` : "",
  ].filter(Boolean).join("\n\n");
}
function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new GameMasterError("API вернул пустой ответ.", "EMPTY_RESPONSE");
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  for (const item of Array.isArray(record.output) ? record.output : []) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) if (part && typeof part === "object" &&
      (part as Record<string, unknown>).type === "output_text" && typeof (part as Record<string, unknown>).text === "string")
      return (part as Record<string, unknown>).text as string;
  }
  throw new GameMasterError("В ответе модели нет текстового результата.", "MISSING_OUTPUT_TEXT");
}
function validateTurn(value: unknown): GameMasterTurn {
  if (!value || typeof value !== "object") throw new GameMasterError("Модель вернула некорректную структуру хода.", "INVALID_TURN");
  const turn = value as Record<string, unknown>;
  const strings = ["narration", "summary", "worldOutcome", "newInGameDate", "consequenceText", "clarificationQuestion"];
  if (strings.some((key) => typeof turn[key] !== "string") || !Number.isInteger(turn.timeDeltaMinutes) ||
    (turn.timeDeltaMinutes as number) < 0 || !Number.isInteger(turn.hpDelta) || typeof turn.needsClarification !== "boolean" ||
    !Array.isArray(turn.rolls) || !Array.isArray(turn.stateNotes))
    throw new GameMasterError("Модель вернула неполную структуру игрового хода. Ничего не сохранено.", "INVALID_TURN");
  const changes = turn.characterChanges as Record<string, unknown> | undefined;
  if (!changes || !Array.isArray(changes.inventory) || !Array.isArray(changes.resources) ||
      !Array.isArray(changes.conditions) || !changes.currencyDelta || typeof changes.currencyDelta !== "object") {
    throw new GameMasterError("Модель не вернула обязательный блок изменений состояния персонажа.", "INVALID_CHARACTER_CHANGES");
  }
  for (const item of changes.inventory as Array<Record<string, unknown>>) {
    if (!["ADD", "REMOVE", "SET"].includes(String(item.action)) || typeof item.name !== "string" ||
        !item.name.trim() || !Number.isInteger(item.quantity) ||
        (item.action === "SET" ? (item.quantity as number) < 0 : (item.quantity as number) < 1) ||
        typeof item.notes !== "string" || !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(item.certainty))) {
      throw new GameMasterError("Некорректное изменение инвентаря в ответе мастера.", "INVALID_INVENTORY_CHANGE");
    }
  }
  for (const resource of changes.resources as Array<Record<string, unknown>>) {
    if (typeof resource.name !== "string" || !resource.name.trim() ||
        (resource.current !== null && (!Number.isInteger(resource.current) || (resource.current as number) < 0)) ||
        (resource.max !== null && (!Number.isInteger(resource.max) || (resource.max as number) < 0)) ||
        (resource.current !== null && resource.max !== null && (resource.current as number) > (resource.max as number)) ||
        typeof resource.recovery !== "string" ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(resource.certainty))) {
      throw new GameMasterError("Некорректное изменение ресурса в ответе мастера.", "INVALID_RESOURCE_CHANGE");
    }
  }
  const currency = changes.currencyDelta as Record<string, unknown>;
  for (const coin of ["cp", "sp", "ep", "gp", "pp"]) {
    if (!Number.isInteger(currency[coin])) throw new GameMasterError("Некорректное изменение валюты.", "INVALID_CURRENCY_CHANGE");
  }
  for (const condition of changes.conditions as Array<Record<string, unknown>>) {
    if (!["ADD", "REMOVE"].includes(String(condition.action)) || typeof condition.name !== "string" || !condition.name.trim()) {
      throw new GameMasterError("Некорректное изменение состояния персонажа.", "INVALID_CONDITION_CHANGE");
    }
  }
  for (const roll of turn.rolls as Array<Record<string, unknown>>) {
    if (typeof roll.label !== "string" || typeof roll.formula !== "string" ||
        roll.result !== "ОЖИДАЕТСЯ БРОСОК ИГРОКА") {
      throw new GameMasterError("Мастер попытался подставить результат броска. Все игровые броски выполняет игрок; ход не принят.", "GM_INVENTED_DICE_RESULT");
    }
  }
  const world = turn.worldChanges as Record<string, unknown> | undefined;
  const worldKeys = ["facts", "npcUpdates", "npcKnowledgeAdditions", "newLocations", "newNpcs", "factionUpdates", "newFactions", "delayedEvents"];
  if (!world || worldKeys.some((key) => !Array.isArray(world[key]))) {
    throw new GameMasterError("Модель не вернула полный блок изменений мира.", "INVALID_WORLD_CHANGES");
  }
  const changesById = (key: string) => world[key] as Array<Record<string, unknown>>;
  for (const fact of changesById("facts")) {
    if (typeof fact.title !== "string" || !fact.title.trim() || typeof fact.statement !== "string" || !fact.statement.trim() ||
        typeof fact.rationale !== "string" || !["OBJECTIVE_TRUTH", "PLAYER_KNOWLEDGE", "OUT_OF_GAME"].includes(String(fact.layer)) ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(fact.certainty)) ||
        !["GLOBAL", "REGION", "LOCATION", "FACTION", "PERSONAL"].includes(String(fact.scope))) {
      throw new GameMasterError("Некорректный факт в изменениях мира.", "INVALID_WORLD_FACT");
    }
  }
  for (const update of changesById("npcUpdates")) {
    if (typeof update.npcId !== "string" || !update.npcId.trim() || typeof update.reason !== "string" || !update.reason.trim()) {
      throw new GameMasterError("Обновление NPC должно указывать ID и причину.", "INVALID_NPC_UPDATE");
    }
  }
  for (const knowledge of changesById("npcKnowledgeAdditions")) {
    if (typeof knowledge.npcId !== "string" || typeof knowledge.factSummary !== "string" || !knowledge.factSummary.trim() ||
        typeof knowledge.sourceId !== "string" || typeof knowledge.acquisitionPath !== "string" || !knowledge.acquisitionPath.trim() ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(knowledge.certainty))) {
      throw new GameMasterError("Запись знаний NPC должна иметь источник и путь получения.", "INVALID_NPC_KNOWLEDGE");
    }
  }
  const newLocationIds = new Set<string>();
  for (const location of changesById("newLocations")) {
    if (typeof location.tempId !== "string" || !location.tempId.trim() || newLocationIds.has(location.tempId) ||
        typeof location.name !== "string" || !location.name.trim() || typeof location.region !== "string" ||
        typeof location.description !== "string" || typeof location.sourceId !== "string" ||
        typeof location.distanceFromCurrent !== "string" ||
        (location.travelTimeHours !== null && (typeof location.travelTimeHours !== "number" || !Number.isFinite(location.travelTimeHours) || location.travelTimeHours < 0)) ||
        typeof location.routeNotes !== "string" || !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(location.certainty)) ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(location.routeCertainty))) {
      throw new GameMasterError("Некорректная новая локация или маршрут.", "INVALID_NEW_LOCATION");
    }
    newLocationIds.add(location.tempId);
  }
  const newNpcIds = new Set<string>();
  for (const npc of changesById("newNpcs")) {
    if (typeof npc.tempId !== "string" || !npc.tempId.trim() || newNpcIds.has(npc.tempId) ||
        typeof npc.name !== "string" || !npc.name.trim() || typeof npc.role !== "string" ||
        typeof npc.goals !== "string" || typeof npc.attitudeToPlayer !== "string" ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(npc.certainty))) {
      throw new GameMasterError("Некорректная новая запись NPC.", "INVALID_NEW_NPC");
    }
    newNpcIds.add(npc.tempId);
  }
  for (const update of changesById("factionUpdates")) {
    if (typeof update.factionId !== "string" || !update.factionId.trim() || typeof update.reason !== "string" || !update.reason.trim()) {
      throw new GameMasterError("Обновление фракции должно указывать ID и причину.", "INVALID_FACTION_UPDATE");
    }
  }
  const newFactionIds = new Set<string>();
  for (const faction of changesById("newFactions")) {
    if (typeof faction.tempId !== "string" || !faction.tempId.trim() || newFactionIds.has(faction.tempId) ||
        typeof faction.name !== "string" || !faction.name.trim() || typeof faction.goals !== "string" ||
        typeof faction.resources !== "string" || typeof faction.standing !== "string" ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(faction.certainty))) {
      throw new GameMasterError("Некорректная новая запись фракции.", "INVALID_NEW_FACTION");
    }
    newFactionIds.add(faction.tempId);
  }
  for (const event of changesById("delayedEvents")) {
    if (typeof event.title !== "string" || !event.title.trim() || typeof event.triggerInGameDate !== "string" ||
        typeof event.consequence !== "string" || !["SCHEDULED", "TRIGGERED", "RESOLVED"].includes(String(event.status)) ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(event.certainty))) {
      throw new GameMasterError("Некорректное отложенное событие.", "INVALID_DELAYED_EVENT");
    }
  }
  const hasPendingRoll = (turn.rolls as Array<Record<string, unknown>>).length > 0;
  if ((turn.needsClarification || hasPendingRoll) && ((turn.timeDeltaMinutes as number) !== 0 || (turn.hpDelta as number) !== 0 ||
      (changes.inventory as unknown[]).length > 0 || (changes.resources as unknown[]).length > 0 ||
      (changes.conditions as unknown[]).length > 0 || Object.values(currency).some((amount) => amount !== 0) ||
      worldKeys.some((key) => (world[key] as unknown[]).length > 0) || turn.newLocationId !== null || turn.newLocationKey !== null)) {
    throw new GameMasterError("При необходимости уточнения мастер не может менять время или HP.", "INVALID_CLARIFICATION_DELTA");
  }
  return turn as unknown as GameMasterTurn;
}
function validateReferences(turn: GameMasterTurn, context: GameMasterContext): void {
  const existingNpcIds = new Set(context.npcs.map((npc) => npc.id));
  const existingFactionIds = new Set(context.factions.map((faction) => faction.id));
  const existingLocationIds = new Set(context.locations.map((location) => location.id));
  const sourceIds = new Set(context.sources.map((source) => source.id));
  sourceIds.add("MANUAL_GM_ENTRY");
  const changes = turn.worldChanges;
  const newNpcIds = new Set(changes.newNpcs.map((npc) => npc.tempId));
  const newFactionIds = new Set(changes.newFactions.map((faction) => faction.tempId));
  const newLocationIds = new Set(changes.newLocations.map((location) => location.tempId));
  if (turn.newLocationId && !existingLocationIds.has(turn.newLocationId)) {
    throw new GameMasterError("Мастер указал неизвестный ID существующей локации. Переход не сохранён.", "UNKNOWN_LOCATION_REFERENCE");
  }
  if (turn.newLocationKey && !newLocationIds.has(turn.newLocationKey)) {
    throw new GameMasterError("Мастер указал newLocationKey без соответствующей новой локации. Переход не сохранён.", "UNKNOWN_NEW_LOCATION_REFERENCE");
  }
  if (turn.newLocationId && turn.newLocationKey) {
    throw new GameMasterError("Мастер не может одновременно выбрать существующую и новую локацию.", "AMBIGUOUS_LOCATION_REFERENCE");
  }
  for (const location of changes.newLocations) {
    if (!sourceIds.has(location.sourceId)) {
      throw new GameMasterError(`Новая локация «${location.name}» ссылается на отсутствующий источник.`, "UNKNOWN_LOCATION_SOURCE");
    }
  }
  for (const fact of changes.facts) {
    if (fact.subjectNpcId && !existingNpcIds.has(fact.subjectNpcId) && !newNpcIds.has(fact.subjectNpcId)) {
      throw new GameMasterError(`Факт «${fact.title}» ссылается на неизвестного NPC.`, "UNKNOWN_FACT_SUBJECT");
    }
  }
  for (const update of changes.npcUpdates) {
    if (!existingNpcIds.has(update.npcId)) throw new GameMasterError("Обновление ссылается на неизвестный NPC.", "UNKNOWN_NPC_REFERENCE");
    if (update.locationId && !existingLocationIds.has(update.locationId) && !newLocationIds.has(update.locationId)) {
      throw new GameMasterError("Обновление NPC ссылается на неизвестную локацию.", "UNKNOWN_NPC_LOCATION");
    }
    if (update.factionId && !existingFactionIds.has(update.factionId) && !newFactionIds.has(update.factionId)) {
      throw new GameMasterError("Обновление NPC ссылается на неизвестную фракцию.", "UNKNOWN_NPC_FACTION");
    }
  }
  for (const npc of changes.newNpcs) {
    if (npc.locationId && !existingLocationIds.has(npc.locationId) && !newLocationIds.has(npc.locationId)) {
      throw new GameMasterError(`Новый NPC «${npc.name}» ссылается на неизвестную локацию.`, "UNKNOWN_NEW_NPC_LOCATION");
    }
    if (npc.factionId && !existingFactionIds.has(npc.factionId) && !newFactionIds.has(npc.factionId)) {
      throw new GameMasterError(`Новый NPC «${npc.name}» ссылается на неизвестную фракцию.`, "UNKNOWN_NEW_NPC_FACTION");
    }
  }
  for (const knowledge of changes.npcKnowledgeAdditions) {
    if (!existingNpcIds.has(knowledge.npcId) && !newNpcIds.has(knowledge.npcId)) {
      throw new GameMasterError("Запись знаний ссылается на неизвестного NPC.", "UNKNOWN_NPC_KNOWLEDGE_SUBJECT");
    }
    if (!sourceIds.has(knowledge.sourceId)) throw new GameMasterError("Знание NPC ссылается на отсутствующий источник.", "UNKNOWN_NPC_KNOWLEDGE_SOURCE");
  }
  for (const update of changes.factionUpdates) {
    if (!existingFactionIds.has(update.factionId)) throw new GameMasterError("Обновление ссылается на неизвестную фракцию.", "UNKNOWN_FACTION_REFERENCE");
  }
}
export async function resolvePlayerAction(apiKey: string, context: GameMasterContext,
  options: { model?: string; fetcher?: typeof fetch } = {}): Promise<GameMasterResult> {
  if (!apiKey.trim()) throw new GameMasterError("Введи API-ключ модели в игровом окне.", "API_KEY_REQUIRED");
  if (!context.action.trim()) throw new GameMasterError("Действие персонажа не может быть пустым.", "EMPTY_ACTION");
  const governing = context.sources.find((source) => source.type === "GOVERNING_DOC" && source.contentStatus === "ATTACHED");
  if (!governing) throw new GameMasterError("Не загружен ОБСИДИАН 4.1. Игра заблокирована: мастер не должен работать по пересказу правил.", "GOVERNING_SOURCE_MISSING");
  const dossier = context.sources.find((source) => source.type === "PLAYER_DOSSIER" && source.contentStatus === "ATTACHED");
  const system = [
    "Ты — игровой мастер-симулятор живого мира D&D 5e редакции 2024 в кампании ОБСИДИАН.",
    "Ниже передан полный управляющий документ. Его правила обязательны; не сокращай и не переопределяй его.",
    "=== ПОЛНЫЙ ОБСИДИАН 4.1 ===\n" + governing.content,
    "=== ЭПИСТЕМИЧЕСКИЕ И КАНОНИЧЕСКИЕ ОГРАНИЧЕНИЯ ===",
    "Различай объективную истину, знания персонажа, знания каждого NPC и OOC. NPC не всеведущи. Не добавляй неподтверждённые факты Экдрасиля. При неизвестности используй UNKNOWN, при приблизительности APPROXIMATE. Досье персонажа не является каноном мира.",
    "Игрок может пытаться совершать любые действия. Не запрещай их произвольно: оцени физическую возможность, механику, риски и последствия.",
    "Не выдумывай результаты бросков. Если нужна проверка, укажи её в rolls с формулой и результатом 'ОЖИДАЕТСЯ БРОСОК ИГРОКА'; не разрешай исход до получения результата. Не бросай за игрока.",
    "Если действие требует уточнения, не продвигай время и не фиксируй последствия; задай один конкретный вопрос в clarificationQuestion.",
    "Выводи только JSON по заданной схеме. Не включай markdown.",
  ].join("\n\n");
  const user = {
    action: context.action, campaign: context.world, playerCharacterState: context.character,
    playerDossier: dossier?.content ?? "UNKNOWN: отдельное досье персонажа не загружено.",
    relevantEkdrasilCanon: selectCanonContext(context.canonFacts, context.sources, context.action),
    knownNpcs: context.npcs, knownFactions: context.factions, knownLocations: context.locations,
    recentJournal: context.journal.slice(-12),
    requirements: [
      "Ответ narration должен соблюдать формат ОБСИДИАН 4.1 и быть на русском языке.",
      "В summary/worldOutcome записывай только произошедшее, не предположения.",
      "Если бросок ожидается, timeDeltaMinutes и hpDelta равны 0, worldOutcome сообщает, что исход ожидает броска.",
      "newInGameDate оставь текущей датой, если время не продвинулось.",
      "characterChanges отражает только реальные изменения ресурсов, предметов, состояний и денег; если изменений нет, верни пустые массивы и нулевые currencyDelta. Не выдумывай вес предметов.",
      "При смене места назначения укажи newLocationId, если это уже зарегистрированная локация. Если место канонично, но ещё не зарегистрировано, добавь его в worldChanges.newLocations и укажи newLocationKey = tempId; не указывай выдуманные координаты/дистанции. При неизвестном расстоянии используй UNKNOWN и null.",
      "worldChanges хранит только доказуемые последствия текущего действия: обновляй NPC и их знания только при конкретном канале получения информации; добавляй факты с корректным эпистемическим слоем и не выдавай гипотезы за объективную истину; ресурсы/цели фракций меняй только при установленной причине; delayedEvents создавай только при реальном отложенном обязательстве/триггере. Пустые коллекции обязательны, когда изменений нет.",
      "Не обновляй NPC, фракции или их знания только потому, что игрок о них подумал или спросил. NPCKnowledgeAddition требует конкретного пути: свидетель, услышанная речь, документ, приказ, отчёт или иной достоверный канал.",
      "Новый NPC/фракция создаются только если персонаж действительно установил контакт/идентичность; неизвестное имя остаётся UNKNOWN, не придумывай имена для безымянных людей.",

      "stateNotes содержит важные изменения/неизвестности, но не подменяет канон.",
    ],
  };
  const model = options.model ?? "gpt-4.1-mini";
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({ model, instructions: system, input: JSON.stringify(user),
        text: { format: { type: "json_schema", name: "obsidian_game_turn", strict: true, schema: turnSchema } } }),
    });
  } catch { throw new GameMasterError("Не удалось подключиться к API модели. Проверь интернет-соединение.", "NETWORK_ERROR"); }
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const err = payload && typeof payload === "object" ? (payload as Record<string, unknown>).error : null;
    const detail = err && typeof err === "object" && typeof (err as Record<string, unknown>).message === "string"
      ? (err as { message: string }).message : "API отклонил запрос.";
    throw new GameMasterError(detail, "MODEL_API_ERROR");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(extractOutputText(payload)); }
  catch (error) { if (error instanceof GameMasterError) throw error; throw new GameMasterError("Модель вернула невалидный JSON. Ничего не сохранено.", "INVALID_JSON"); }
  const record = payload as Record<string, unknown>;
  const usage = record.usage && typeof record.usage === "object" ? record.usage as GameMasterResult["usage"] : undefined;
  const turn = validateTurn(parsed);
  validateReferences(turn, context);
  return { turn, model, usage };
}
