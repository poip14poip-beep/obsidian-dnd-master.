import type {
  AuditLogState,
  ObsidianCollections,
  PlayerCharacterState,
  SessionLogState,
  SourceDocument,
  TurnDraft,
  WorldState,
} from "./types";

export const DEFAULT_SOURCE_IDS = {
  GOVERNING: "src-obsidian-41",
  CANON: "src-ekdrasil-chronicle",
  DOSSIER: "src-lia-vein-dossier",
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
      certainty: "UNKNOWN",
      fileName: null,
      content: "",
      checksum: "EMPTY",
      attachedAt: null,
      notes:
        "Управляющий документ симуляции D&D 5e (2024) по ОБСИДИАН 4.1. Загрузите оригинал в разделе «Источники»; содержимое не додумывается.",
    },
    {
      id: DEFAULT_SOURCE_IDS.CANON,
      title: "Хроника Экдрасиля",
      type: "WORLD_CANON",
      targetPartition: "CAMPAIGN_STATE",
      originLabel: "Источник канона мира (файл не прикреплён)",
      contentStatus: "NOT_ATTACHED",
      certainty: "UNKNOWN",
      fileName: null,
      content: "",
      checksum: "EMPTY",
      attachedAt: null,
      notes:
        "Канонический источник сведений о мире. Наличие файла не означает старт кампании и не импортирует старые ходы или локации автоматически.",
    },
    {
      id: DEFAULT_SOURCE_IDS.DOSSIER,
      title: "Досье Лии Вейн",
      type: "PLAYER_DOSSIER",
      targetPartition: "PLAYER_CHARACTER_STATE",
      originLabel: "Отдельный лист персонажа игрока (файл не прикреплён)",
      contentStatus: "NOT_ATTACHED",
      certainty: "UNKNOWN",
      fileName: null,
      content: "",
      checksum: "EMPTY",
      attachedAt: null,
      notes:
        "Изолированный источник для PLAYER_CHARACTER_STATE. Никогда не вкладывается в CAMPAIGN_STATE.",
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