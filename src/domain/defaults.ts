import type {
  AuditLogState,
  CampaignPreferences,
  ObsidianCollections,
  PlayerCharacterState,
  SessionLogState,
  SourceDocument,
  TurnDraft,
  WorldState,
} from "./types";

export const DEFAULT_CAMPAIGN_PREFERENCES: CampaignPreferences = {
  allowedBooksAndOptions: "Только D&D 5e (2024) и SRD 5.2.1. Материалы 2014 года и дополнительные книги/опциональные правила не применяются без отдельной записи в RULE_LEDGER.",
  diceMethod: "Броски выполняются встроенным криптографическим генератором Web Crypto; мастер показывает формулу, результат и модификаторы. Если генератор недоступен, бросок выполняет игрок физическими кубиками.",
  advancement: "XP по таблице прогрессии D&D 2024. Milestone не используется; переход уровня фиксируется по накопленному опыту.",
  foodAndWater: "Применять базовые правила D&D 2024 по пище и воде, когда это имеет значение; дополнительных домашних штрафов не вводить.",
  randomEncounters: "Универсальные таблицы не используются. Только региональные таблицы из источников кампании или официального материала; если подходящей таблицы нет, случайный бросок не проводится.",
  pvp: "Не используется: кампания рассчитана на одного игрока и одного персонажа.",
  deathAndResurrection: "Базовые правила D&D 2024 / SRD 5.2.1. Индивидуальные исключения, проклятия и правила возвращения к жизни отсутствуют, пока не подтверждены досье персонажа, хроникой или отдельно согласованным правилом кампании.",
  economyDetail: "Детальный учёт денег, цен, сделок, запасов, владельца и местонахождения предметов. Изменения только при подтверждённых событиях.",
  contentBoundaries: "Дополнительные личные ограничения игроком пока не заданы. Соблюдать системные ограничения платформы; при спорной или чувствительной сцене остановиться и уточнить границу до продолжения.",
  houseRules: "Никаких индивидуальных домашних правил по умолчанию. Новые правила и исключения применяются только после явного согласования игроком и фиксации в реестре правил кампании.",
};

export const DEFAULT_SOURCE_IDS = {
  GOVERNING: "src-obsidian-41",
  CANON: "src-ekdrasil-chronicle",
  DOSSIER: "src-player-character-dossier",
  SRD: "src-srd-5-2-1",
} as const;

export function createInitialSources(): SourceDocument[] {
  return [
    {
      id: DEFAULT_SOURCE_IDS.GOVERNING,
      playerVisible: false,
      serverManaged: true,
      title: "ОБСИДИАН 4.1",
      type: "GOVERNING_DOC",
      targetPartition: "SYSTEM_RULES",
      originLabel: "Постоянное серверное ядро ОБСИДИАН 4.1",
      contentStatus: "ATTACHED",
      reviewStatus: "VERIFIED",
      contextEnabled: true,
      certainty: "KNOWN",
      fileName: null,
      content: "",
      checksum: "SERVER_MANAGED",
      attachedAt: null,
      notes:
        "Полный текст хранится только в закрытом серверном хранилище и добавляется к запросу мастера на сервере. Браузер получает только этот маркер; редактирование через клиент запрещено.",
      processing: { status: "PROCESSED", sha256: null, characterCount: 0, lineCount: 0, sectionCount: 0, chunkCount: 0, dateCandidateCount: 0, processedAt: null, warnings: [] },
    },
    {
      id: DEFAULT_SOURCE_IDS.CANON,
      playerVisible: false,
      serverManaged: true,
      title: "Библия мира — Экдрасиль",
      type: "WORLD_CANON",
      targetPartition: "SYSTEM_RULES",
      originLabel: "Постоянная серверная база канона Экдрасиля",
      contentStatus: "ATTACHED",
      reviewStatus: "VERIFIED",
      contextEnabled: true,
      certainty: "KNOWN",
      fileName: null,
      content: "",
      checksum: "SERVER_MANAGED",
      attachedAt: null,
      notes:
        "Канон содержит только сведения об Экдрасиле: устройство мира, историю, географию, народы, государства, культуры, фракции и объективные мировые факты. Персонажи игроков, их досье и события отдельных кампаний хранятся отдельно.",
      processing: { status: "NOT_PROCESSED", sha256: null, characterCount: 0, lineCount: 0, sectionCount: 0, chunkCount: 0, dateCandidateCount: 0, processedAt: null, warnings: [] },
    },
    {
      id: DEFAULT_SOURCE_IDS.SRD,
      playerVisible: false,
      serverManaged: true,
      title: "SRD 5.2.1",
      type: "SUPPLEMENTAL",
      targetPartition: "SYSTEM_RULES",
      originLabel: "Постоянная серверная база правил D&D 2024",
      contentStatus: "ATTACHED",
      reviewStatus: "VERIFIED",
      contextEnabled: true,
      certainty: "KNOWN",
      fileName: null,
      content: "",
      checksum: "SERVER_MANAGED",
      attachedAt: null,
      notes: "Полный текст SRD 5.2.1 хранится отдельно в закрытом серверном хранилище и извлекается мастером по контексту действия. Браузер не получает текст правил.",
      processing: { status: "PROCESSED", sha256: null, characterCount: 0, lineCount: 0, sectionCount: 0, chunkCount: 0, dateCandidateCount: 0, processedAt: null, warnings: [] },
    },
    {
      id: DEFAULT_SOURCE_IDS.DOSSIER,
      playerVisible: false,
      title: "Лист персонажа текущей кампании",
      type: "PLAYER_DOSSIER",
      targetPartition: "PLAYER_CHARACTER_STATE",
      originLabel: "Загружается игроком при подготовке конкретной кампании",
      contentStatus: "NOT_ATTACHED",
      reviewStatus: "UNREVIEWED",
      contextEnabled: false,
      certainty: "UNKNOWN",
      fileName: null,
      content: "",
      checksum: "EMPTY",
      attachedAt: null,
      notes:
        "Лист персонажа прикрепляется только к текущей кампании и хранится отдельно от канона Экдрасиля и управляющих правил мастера.",
      processing: { status: "NOT_PROCESSED", sha256: null, characterCount: 0, lineCount: 0, sectionCount: 0, chunkCount: 0, dateCandidateCount: 0, processedAt: null, warnings: [] },
    },
  ];
}

export function createInitialWorldState(): WorldState {
  return {
    schemaVersion: 1,
    stateVersion: 1,
    campaignName: "",
    ruleset: "D&D 5e (2024) · ОБСИДИАН 4.1",
    calendarSystem: "UNKNOWN",
    startInGameDate: "UNKNOWN",
    currentInGameDate: "UNKNOWN",
    elapsedMinutes: 0,
    encumbranceMode: "UNSET",
    campaignPreferences: DEFAULT_CAMPAIGN_PREFERENCES,
    quests: [],
    environment: {
      temperatureC: null, temperatureCertainty: "UNKNOWN", weather: "UNKNOWN", lighting: "UNKNOWN",
      visibility: "UNKNOWN", wind: "UNKNOWN", precipitation: "UNKNOWN", ambientSounds: "UNKNOWN", ambientSmells: "UNKNOWN", notes: "",
    },
    startLocationName: "UNKNOWN",
    currentLocationId: null,
    setup: {
      sourcesConfirmed: false,
      parametersConfirmed: false,
      startPointConfirmed: false,
      characterConfirmed: false,
      noAutoImportAcknowledged: false,
      confirmed: false,
      confirmedAt: null,
    },
    routes: [],
    consequences: [],
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

export function createInitialPlayerCharacterState(): PlayerCharacterState {
  return {
    schemaVersion: 1,
    stateVersion: 1,
    sourceDossierId: DEFAULT_SOURCE_IDS.DOSSIER,
    name: "UNKNOWN",
    nameCertainty: "UNKNOWN",
    speciesAndClass: "UNKNOWN",
    level: null,
    hpCurrent: null,
    hpMax: null,
    hpTemp: null,
    armorClass: null,
    statsCertainty: "UNKNOWN",
    currentLocationLabel: "UNKNOWN",
    conditions: [],
    resources: [],
    inventory: [],
    notes: "",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

export function createInitialSessionLogState(): SessionLogState {
  return {
    schemaVersion: 1,
    lastTurnNumber: 0,
    entries: [],
  };
}

export function createInitialAuditLogState(): AuditLogState {
  return {
    schemaVersion: 1,
    entries: [],
  };
}

export function createEmptyTurnDraft(id = "draft-active"): TurnDraft {
  return {
    id,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    summary: "",
    playerIntent: "",
    worldOutcome: "",
    campaignMemory: "",
    timeDeltaMinutes: 0,
    newInGameDate: "",
    newLocationId: "",
    hpDelta: 0,
    consequenceText: "",
    newFactTitle: "",
    newFactStatement: "",
    newFactRationale: "",
    newFactLayer: "OBJECTIVE_TRUTH",
    newFactCertainty: "KNOWN",
    newFactSourceId: DEFAULT_SOURCE_IDS.CANON,
    rolls: [],
    characterChanges: { inventory: [], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } },
    npcChanges: [],
    checkedAt: null,
    validationErrors: [],
  };
}

export function createInitialCollections(): ObsidianCollections {
  return {
    sources: createInitialSources(),
    canon_facts: [],
    world_state: createInitialWorldState(),
    player_character_state: createInitialPlayerCharacterState(),
    npcs: [],
    factions: [],
    locations: [],
    timeline_events: [],
    turn_drafts: [createEmptyTurnDraft()],
    session_log: createInitialSessionLogState(),
    audit_log: createInitialAuditLogState(),
  };
}