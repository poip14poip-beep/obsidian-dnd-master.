import type { CanonFact, FactionRecord, GameTurnEntry, LocationRecord, NpcRecord, PlayerCharacterState, SourceDocument, TechnicalMessageEntry, WorldState, DelayedEvent, NpcTurnChange } from "./types";

export interface GameMasterContext {
  action: string; sources: SourceDocument[]; world: WorldState; character: PlayerCharacterState;
  canonFacts: CanonFact[]; npcs: NpcRecord[]; factions: FactionRecord[]; locations: LocationRecord[];
  journal: Array<GameTurnEntry | TechnicalMessageEntry>; timelineEvents: DelayedEvent[];
}
export interface GameMasterTurn {
  narration: string; campaignMemory: string; sensoryDescription: string; spatialAccounting: string;
  mechanics: string; consequences: string; resourceAccounting: string; nextAction: string;
  summary: string; worldOutcome: string; timeDeltaMinutes: number; hpDelta: number;
  newInGameDate: string; newLocationId: string | null; consequenceText: string;
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
      role: { type: "string" }, goals: { type: "string" }, attitudeToPlayer: { type: "string" },
      locationName: { type: ["string", "null"] }, factionName: { type: ["string", "null"] },
      certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] }, reason: { type: "string" },
      knowledgeAdditions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        factSummary: { type: "string" }, acquisitionPath: { type: "string" },
        certainty: { type: "string", enum: ["KNOWN", "APPROXIMATE", "UNKNOWN"] },
      }, required: ["factSummary", "acquisitionPath", "certainty"] } },
    }, required: ["action", "name", "role", "goals", "attitudeToPlayer", "locationName", "factionName", "certainty", "reason", "knowledgeAdditions"] } },
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
  required: ["narration", "campaignMemory", "sensoryDescription", "spatialAccounting", "mechanics", "consequences", "resourceAccounting", "nextAction", "summary", "worldOutcome", "timeDeltaMinutes", "hpDelta", "newInGameDate", "newLocationId", "consequenceText", "rolls", "characterChanges", "npcChanges", "needsClarification", "clarificationQuestion", "stateNotes"],
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
      if (!line.trim()) { flush(index); startLine = index + 2; }
      else { if (current.length === 0) startLine = index + 1; current.push(line); }
    });
    flush(lines.length);
    return paragraphs.map((paragraph) => {
      const haystack = paragraph.text.toLocaleLowerCase();
      return { source, sectionId: "UNINDEXED", headingPath: [], ...paragraph,
        score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
    });
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.startLine - b.startLine).slice(0, 8);
  const factText = facts.filter((fact) => fact.layer === "OBJECTIVE_TRUTH" && fact.certainty !== "UNKNOWN")
    .slice(0, 30).map((fact) => `[${fact.certainty}] ${fact.title}: ${fact.statement} (источник: ${fact.sourceId})`).join("\n");
  return [
    ranked.length ? ranked.map((item) =>
      `[ИСТОЧНИК: ${item.source.title}; sourceId=${item.source.id}; sectionId=${item.sectionId}; строки ${item.startLine}–${item.endLine}]\n${item.text}`,
    ).join("\n\n") : "Релевантные фрагменты хроники по запросу не найдены. Не заполняй пробелы выдуманным каноном.",
    factText ? `ПОДТВЕРЖДЁННЫЕ ФАКТЫ КАМПАНИИ:\n${factText}` : "",
  ].filter(Boolean).join("\n\n");
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
function validateTurn(value: unknown, knownLocations: LocationRecord[], knownNpcs: NpcRecord[], knownFactions: FactionRecord[]): GameMasterTurn {
  if (!value || typeof value !== "object") throw new GameMasterError("Модель вернула некорректную структуру хода.", "INVALID_TURN");
  const turn = value as Record<string, unknown>;
  const strings = ["narration", "campaignMemory", "sensoryDescription", "spatialAccounting", "mechanics", "consequences", "resourceAccounting", "nextAction", "summary", "worldOutcome", "newInGameDate", "consequenceText", "clarificationQuestion"];
  if (strings.some((key) => typeof turn[key] !== "string") || !Number.isInteger(turn["timeDeltaMinutes"]) ||
    (turn["timeDeltaMinutes"] as number) < 0 || !Number.isInteger(turn["hpDelta"]) || (turn["newLocationId"] !== null && typeof turn["newLocationId"] !== "string") || typeof turn["needsClarification"] !== "boolean" ||
    !Array.isArray(turn["rolls"]) || !Array.isArray(turn["stateNotes"]))
    throw new GameMasterError("Модель вернула неполную структуру игрового хода. Ничего не сохранено.", "INVALID_TURN");
  if (!Array.isArray(turn["npcChanges"])) throw new GameMasterError("Модель не вернула обязательный список изменений NPC.", "INVALID_NPC_CHANGES");
  for (const npc of turn["npcChanges"] as Array<Record<string, unknown>>) {
    if (!["CREATE", "UPDATE"].includes(String(npc["action"])) || typeof npc["name"] !== "string" || !npc["name"].trim() ||
        typeof npc["role"] !== "string" || typeof npc["goals"] !== "string" || typeof npc["attitudeToPlayer"] !== "string" ||
        (npc["locationName"] !== null && typeof npc["locationName"] !== "string") ||
        (npc["factionName"] !== null && typeof npc["factionName"] !== "string") ||
        !["KNOWN", "APPROXIMATE", "UNKNOWN"].includes(String(npc["certainty"])) ||
        typeof npc["reason"] !== "string" || !Array.isArray(npc["knowledgeAdditions"])) {
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
    for (const knowledge of npc["knowledgeAdditions"] as Array<Record<string, unknown>>) {
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
  const hasWorldDelta = (turn["npcChanges"] as unknown[]).length > 0 || turn["newLocationId"] !== null ||
    (turn["consequenceText"] as string).trim().length > 0;
  if ((turn["needsClarification"] || hasPendingRoll) && (
    (turn["timeDeltaMinutes"] as number) !== 0 || (turn["hpDelta"] as number) !== 0 ||
    hasCharacterDelta || hasWorldDelta
  )) {
    throw new GameMasterError("При ожидаемом броске или уточнении мастер не может фиксировать время, HP, предметы, ресурсы, NPC, локацию или последствия.", "INVALID_CLARIFICATION_DELTA");
  }
  return turn as unknown as GameMasterTurn;
}
export async function resolvePlayerAction(apiKey: string, context: GameMasterContext,
  options: { model?: string; fetcher?: typeof fetch } = {}): Promise<GameMasterResult> {
  if (!apiKey.trim()) throw new GameMasterError("Введи API-ключ модели в игровом окне.", "API_KEY_REQUIRED");
  if (!context.action.trim()) throw new GameMasterError("Действие персонажа не может быть пустым.", "EMPTY_ACTION");
  const governing = context.sources.find((source) =>
    source.type === "GOVERNING_DOC" && source.contentStatus === "ATTACHED" &&
    source.processing?.status === "PROCESSED" && source.reviewStatus === "VERIFIED" && source.contextEnabled === true
  );
  if (!governing) throw new GameMasterError(
    "ОБСИДИАН 4.1 должен быть загружен, обработан, проверен пользователем и включён в контекст ИИ.",
    "GOVERNING_SOURCE_NOT_READY",
  );
  const dossier = context.sources.find((source) =>
    source.type === "PLAYER_DOSSIER" && source.contentStatus === "ATTACHED" &&
    source.processing?.status === "PROCESSED" && source.reviewStatus === "VERIFIED" && source.contextEnabled === true
  );
  if (!dossier) throw new GameMasterError(
    "Досье персонажа должно быть загружено, обработано, проверено пользователем и включено в контекст ИИ.",
    "PLAYER_DOSSIER_NOT_READY",
  );
  const system = [
    "Ты — игровой мастер-симулятор живого мира D&D 5e редакции 2024 в кампании ОБСИДИАН.",
    "Ниже передан полный управляющий документ. Его правила обязательны; не сокращай и не переопределяй его.",
    "=== ПОЛНЫЙ ОБСИДИАН 4.1 ===\n" + governing.content,
    "=== ЭПИСТЕМИЧЕСКИЕ И КАНОНИЧЕСКИЕ ОГРАНИЧЕНИЯ ===",
    "Различай объективную истину, знания персонажа, знания каждого NPC и OOC. NPC не всеведущи. Не добавляй неподтверждённые факты Экдрасиля. При неизвестности используй UNKNOWN, при приблизительности APPROXIMATE. Досье персонажа не является каноном мира.",
    "Игрок может пытаться совершать любые действия. Не запрещай их произвольно: оцени физическую возможность, механику, риски и последствия.",
    "Кампания является свободной песочницей. Не назначай персонажу квест, поручение, обязательную встречу, пророчество или сюжетную цель по собственной инициативе. Не создавай искусственную завязку, которая требует следовать одному маршруту. NPC могут иметь собственные дела и цели, а мир может развиваться независимо; игрок сам решает, с чем взаимодействовать.",
    "Если в campaign.startNarrative содержится сгенерированная стартовая ситуация, считай её исходным состоянием текущего прохождения. Не переиначивай её задним числом. Не превращай бытовую сцену в квест. Развивай только последствия действий игрока и причинно обоснованные события мира.",
    "Не выдумывай результаты бросков. Если нужна проверка, укажи её в rolls с формулой и результатом 'ОЖИДАЕТСЯ БРОСОК ИГРОКА'; не разрешай исход до получения результата. Не бросай за игрока.",
    "Если действие требует уточнения, не продвигай время и не фиксируй последствия; задай один конкретный вопрос в clarificationQuestion.",
    "Выводи только JSON по заданной схеме. Не включай markdown.",
  ].join("\n\n");
  const user = {
    action: context.action, campaign: context.world, playerCharacterState: context.character,
    playerDossier: dossier?.content ?? "UNKNOWN: отдельное досье персонажа не загружено.",
    relevantEkdrasilCanon: selectCanonContext(context.canonFacts, context.sources, context.action),
    knownNpcs: context.npcs, knownFactions: context.factions, knownLocations: context.locations, scheduledAndDelayedEvents: context.timelineEvents,
    recentJournal: context.journal.slice(-12),
    requirements: [
      "Верни отдельные обязательные блоки campaignMemory, sensoryDescription, spatialAccounting, mechanics, consequences, resourceAccounting и nextAction. narration — только описание сцены.",
      "Не придумывай дату, погоду, освещение, точные расстояния, позиции или параметры. Если поле неизвестно, явно напиши НЕ УСТАНОВЛЕНО/UNKNOWN; приблизительное пометь APPROXIMATE.",
      "sensoryDescription содержит только то, что персонаж реально воспринимает; если новых ощущений нет, так и напиши.",
      "spatialAccounting показывает только известные позиции, расстояния и препятствия; не выводи точные расстояния из художественного описания.",
      "mechanics указывает применённое правило/источник, проверку, модификатор, преимущество/помеху, DC/AC и результат; если бросок не нужен, объясни почему.",
      "resourceAccounting показывает затронутые ресурсы и явно отмечает, если изменений нет. nextAction заканчивается открытым вопросом без навязывания вариантов.",
      "Ответ должен быть на русском языке.",
      "Это свободная кампания: не подсовывай игроку задания и не формулируй обязательную цель. Завершай сцену открытым состоянием мира, а не списком квестов. События и предложения NPC допустимы только как естественные последствия их собственных целей и обстоятельств; игрок свободен проигнорировать их.",
      "В summary/worldOutcome записывай только произошедшее, не предположения.",
      "Если бросок ожидается, timeDeltaMinutes и hpDelta равны 0, worldOutcome сообщает, что исход ожидает броска.",
      "newInGameDate оставь текущей датой, если время не продвинулось. newLocationId меняй только если персонаж фактически прибыл в зарегистрированную локацию из knownLocations; не телепортируй и не выдумывай ID.",
      "npcChanges содержит только NPC, реально впервые представленных или чьё состояние/знание изменилось в этой сцене. CREATE только для нового встреченного NPC, UPDATE только для уже существующего из knownNpcs. Не создавай дубликаты. locationName и factionName — только точные имена из knownLocations/knownFactions или null. knowledgeAdditions — только сведения, которые конкретный NPC получил через описанный канал; не делай NPC всеведущими. reason объясняет источник изменения. Если изменений нет — пустой массив.",
      "characterChanges отражает только реальные изменения ресурсов, предметов, состояний и денег; если изменений нет, верни пустые массивы и нулевые currencyDelta. Не выдумывай вес предметов.",
      "Учитывай scheduledAndDelayedEvents: событие срабатывает только при пересечении его подтверждённого срока/условия. Не запускай его раньше и не игнорируй при пересечении. Если точный формат даты неизвестен, не угадывай — оставь событие ожидающим уточнения.",
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
  return { turn: validateTurn(parsed, context.locations, context.npcs, context.factions), model, ...(usage ? { usage } : {}) };
}
