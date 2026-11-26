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
  deathAndResurrection: "Базовые правила D&D 2024. Индивидуальное проклятие Лии: возвращение ровно через 168 часов на месте гибели с восстановленным телом, но без имущества. Других исключений нет.",
  economyDetail: "Детальный учёт денег, цен, сделок, запасов, владельца и местонахождения предметов. Изменения только при подтверждённых событиях.",
  contentBoundaries: "Дополнительные личные ограничения игроком пока не заданы. Соблюдать системные ограничения платформы; при спорной или чувствительной сцене остановиться и уточнить границу до продолжения.",
  houseRules: "Только явно зафиксированные правила: эпический уровень 21 Лии «Память веков» и её индивидуальное проклятие из досье. Новые домашние правила — только после согласования.",
};

export const DEFAULT_SOURCE_IDS = {
  GOVERNING: "src-obsidian-41",
  CANON: "src-ekdrasil-chronicle",
  DOSSIER: "src-lia-vein-dossier",
  SRD: "src-srd-5-2-1",
} as const;

export function createInitialSources(): SourceDocument[] {
  return [
    {
      id: DEFAULT_SOURCE_IDS.GOVERNING,
      title: "ОБСИДИАН 4.1",
      type: "GOVERNING_DOC",
      targetPartition: "SYSTEM_RULES",
      originLabel: "Управляющий документ правил (файл не прикреплён)",
      contentStatus: "NOT_ATTACHED",
      reviewStatus: "UNREVIEWED",
      contextEnabled: false,
      certainty: "UNKNOWN",
      fileName: null,
      content: "",
      checksum: "EMPTY",
      attachedAt: null,
      notes:
        "Управляющий документ симуляции D&D 5e (2024) по ОБСИДИАН 4.1. Загрузите оригинал в разделе «Источники»; содержимое не додумывается.",
      processing: { status: "NOT_PROCESSED", sha256: null, characterCount: 0, lineCount: 0, sectionCount: 0, chunkCount: 0, dateCandidateCount: 0, processedAt: null, warnings: [] },
    },
    {
      id: DEFAULT_SOURCE_IDS.CANON,
      title: "Хроника Экдрасиля",
      type: "WORLD_CANON",
      targetPartition: "CAMPAIGN_STATE",
      originLabel: "Источник канона мира (файл не прикреплён)",
      contentStatus: "NOT_ATTACHED",
      reviewStatus: "UNREVIEWED",
      contextEnabled: false,
      certainty: "UNKNOWN",
      fileName: null,
      content: "",
      checksum: "EMPTY",
      attachedAt: null,
      notes:
        "Канонический источник сведений о мире. Наличие файла не означает старт кампании и не импортирует старые ходы или локации автоматически.",
      processing: { status: "NOT_PROCESSED", sha256: null, characterCount: 0, lineCount: 0, sectionCount: 0, chunkCount: 0, dateCandidateCount: 0, processedAt: null, warnings: [] },
    },
    {
      id: DEFAULT_SOURCE_IDS.SRD,
      title: "SRD 5.2.1",
      type: "SUPPLEMENTAL",
      targetPartition: "SYSTEM_RULES",
      originLabel: "Дополнительный источник правил D&D 2024 (полный текст не прикреплён)",
      contentStatus: "NOT_ATTACHED",
      reviewStatus: "UNREVIEWED",
      contextEnabled: false,
      certainty: "UNKNOWN",
      fileName: null,
      content: "",
      checksum: "EMPTY",
      attachedAt: null,
      notes: "Необязательный полный текст SRD 5.2.1. Загрузите извлечённый .md/.txt, обработайте, вручную проверьте и включите в контекст. Встроенная краткая справка по основным правилам доступна мастеру и без этого источника.",
      processing: { status: "NOT_PROCESSED", sha256: null, characterCount: 0, lineCount: 0, sectionCount: 0, chunkCount: 0, dateCandidateCount: 0, processedAt: null, warnings: [] },
    },
    {
      id: DEFAULT_SOURCE_IDS.DOSSIER,
      title: "Досье Лии Вейн",
      type: "PLAYER_DOSSIER",
      targetPartition: "PLAYER_CHARACTER_STATE",
      originLabel: "Отдельный лист персонажа игрока (файл не прикреплён)",
      contentStatus: "NOT_ATTACHED",
      reviewStatus: "UNREVIEWED",
      contextEnabled: false,
      certainty: "UNKNOWN",
      fileName: null,
      content: "",
      checksum: "EMPTY",
      attachedAt: null,
      notes:
        "Изолированный источник для PLAYER_CHARACTER_STATE. Никогда не вкладывается в CAMPAIGN_STATE.",
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