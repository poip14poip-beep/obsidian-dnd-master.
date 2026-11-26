import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createEmptyTurnDraft, createInitialCollections } from "@/domain/defaults";
import { applyWorldChangeSet } from "@/domain/apply-world-changes";
import {
  buildBackupEnvelope,
  computeChecksum,
  runIntegrityAudit,
  validateBackupEnvelope,
  validateTurnDraft,
} from "@/domain/integrity";
import {
  getBrowserStorage,
  loadAllCollections,
  persistAndVerifyCollections,
  STORAGE_KEYS,
  type PersistVerifyResult,
  type StorageLike,
} from "@/domain/storage";
import type {
  AuditEntry,
  AuditLogState,
  CharacterChangeSet,
  BackupEnvelope,
  CampaignSetupState,
  CanonFact,
  CharacterResource,
  DelayedEvent,
  FactionRecord,
  GameTurnEntry,
  IntegrityReport,
  InventoryItem,
  LocationRecord,
  NpcKnowledgeEntry,
  NpcRecord,
  ObsidianCollections,
  PlayerCharacterState,
  SessionLogState,
  SourceDocument,
  TechnicalMessageEntry,
  TravelRoute,
  TurnDraft,
  WorldConsequence,
  WorldChangeSet,
  WorldState,
} from "@/domain/types";

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface ObsidianStoreValue {
  hydrated: boolean;
  collections: ObsidianCollections;
  sources: SourceDocument[];
  canonFacts: CanonFact[];
  worldState: WorldState;
  character: PlayerCharacterState;
  npcs: NpcRecord[];
  factions: FactionRecord[];
  locations: LocationRecord[];
  timelineEvents: DelayedEvent[];
  turnDrafts: TurnDraft[];
  turnDraft: TurnDraft;
  sessionLog: SessionLogState;
  auditLog: AuditLogState;
  lastIntegrityReport: IntegrityReport | null;
  lastStorageError: string | null;

  // Sources
  attachSourceContent: (
    sourceId: string,
    payload: { fileName: string | null; content: string; originLabel: string; notes: string },
  ) => PersistVerifyResult;
  addSupplementalSource: (payload: {
    title: string;
    originLabel: string;
    content: string;
    fileName: string | null;
    notes: string;
  }) => PersistVerifyResult;

  // Canon / Facts
  addFact: (
    input: Omit<CanonFact, "id" | "createdAt" | "version" | "history">,
  ) => PersistVerifyResult;
  amendFact: (
    factId: string,
    update: {
      statement: string;
      rationale: string;
      certainty: CanonFact["certainty"];
      reason: string;
    },
  ) => PersistVerifyResult;
  toggleFactLock: (factId: string) => PersistVerifyResult;

  // NPCs
  addNpc: (
    input: Omit<NpcRecord, "id" | "knowledge" | "version" | "history">,
  ) => PersistVerifyResult;
  amendNpc: (
    npcId: string,
    update: {
      role: string;
      locationId: string | null;
      factionId: string | null;
      goals: string;
      attitudeToPlayer: string;
      certainty: NpcRecord["certainty"];
      reason: string;
    },
  ) => PersistVerifyResult;
  addNpcKnowledge: (
    npcId: string,
    entry: Omit<NpcKnowledgeEntry, "id" | "recordedAt">,
  ) => PersistVerifyResult;

  // Factions
  addFaction: (input: Omit<FactionRecord, "id" | "version" | "history">) => PersistVerifyResult;
  amendFaction: (
    factionId: string,
    update: {
      goals: string;
      resources: string;
      standing: string;
      certainty: FactionRecord["certainty"];
      reason: string;
    },
  ) => PersistVerifyResult;

  // Time & Map
  addLocation: (input: Omit<LocationRecord, "id">) => PersistVerifyResult;
  addTravelRoute: (input: Omit<TravelRoute, "id">) => PersistVerifyResult;
  addDelayedEvent: (input: Omit<DelayedEvent, "id">) => PersistVerifyResult;
  updateDelayedEventStatus: (
    eventId: string,
    status: DelayedEvent["status"],
  ) => PersistVerifyResult;
  addWorldConsequence: (input: Omit<WorldConsequence, "id">) => PersistVerifyResult;

  // Isolated PLAYER_CHARACTER_STATE
  updatePlayerCharacter: (
    patch: Partial<Omit<PlayerCharacterState, "schemaVersion" | "stateVersion" | "updatedAt">>,
  ) => PersistVerifyResult;
  addCharacterResource: (res: Omit<CharacterResource, "id">) => PersistVerifyResult;
  updateCharacterResource: (id: string, current: number | null) => PersistVerifyResult;
  addInventoryItem: (item: Omit<InventoryItem, "id">) => PersistVerifyResult;
  removeInventoryItem: (id: string) => PersistVerifyResult;
  updateInventoryItem: (id: string, patch: Partial<Omit<InventoryItem, "id">>) => PersistVerifyResult;

  // Setup Wizard & Campaign Parameters
  updateCampaignParameters: (patch: {
    campaignName?: string;
    calendarSystem?: string;
    startInGameDate?: string;
    startLocationName?: string;
    encumbranceMode?: WorldState["encumbranceMode"];
    setupPatch?: Partial<Omit<CampaignSetupState, "confirmed" | "confirmedAt">>;
  }) => PersistVerifyResult;
  confirmCampaignSetup: () => PersistVerifyResult;

  // Turns & Append-only Journal
  updateTurnDraft: (patch: Partial<TurnDraft>) => void;
  saveTurnDraftExplicit: () => PersistVerifyResult;
  checkTurnDraft: () => { ok: boolean; errors: string[] };
  commitTurnDraft: (explicitConfirmation: boolean) => PersistVerifyResult;
  addTechnicalMessage: (text: string) => PersistVerifyResult;

  // Audit & Backup
  runAuditNow: () => IntegrityReport;
  exportBackupJson: () => BackupEnvelope;
  importBackupJson: (rawJson: string) => PersistVerifyResult;
}

const ObsidianStoreContext = createContext<ObsidianStoreValue | null>(null);

export function ObsidianStoreProvider({
  children,
  storageOverride,
}: {
  children: ReactNode;
  storageOverride?: StorageLike;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [collections, setCollections] = useState<ObsidianCollections>(() =>
    createInitialCollections(),
  );
  const [lastIntegrityReport, setLastIntegrityReport] = useState<IntegrityReport | null>(null);
  const [lastStorageError, setLastStorageError] = useState<string | null>(null);

  const resolveStorage = useCallback(
    () => storageOverride ?? getBrowserStorage(),
    [storageOverride],
  );

  useEffect(() => {
    const storage = resolveStorage();
    const loaded = loadAllCollections(storage);
    if (loaded.turn_drafts.length === 0) {
      loaded.turn_drafts = [createEmptyTurnDraft()];
    }
    setCollections(loaded);
    setLastIntegrityReport(runIntegrityAudit(loaded));
    setHydrated(true);
  }, [resolveStorage]);

  const commitCollections = useCallback(
    (next: ObsidianCollections, expectedTailTurnNumber?: number): PersistVerifyResult => {
      const result = persistAndVerifyCollections(resolveStorage(), next, expectedTailTurnNumber);
      if (result.ok) {
        setCollections(next);
        setLastIntegrityReport(result.report);
        setLastStorageError(null);
      } else {
        setLastStorageError(result.error);
        if (result.report) setLastIntegrityReport(result.report);
      }
      return result;
    },
    [resolveStorage],
  );

  const appendAudit = useCallback(
    (
      baseAudit: AuditLogState,
      action: AuditEntry["action"],
      status: AuditEntry["status"],
      details: string,
      nextWorld: WorldState,
      nextCharacter: PlayerCharacterState,
      turnNumber: number | null = null,
    ): AuditLogState => ({
      ...baseAudit,
      entries: [
        ...baseAudit.entries,
        {
          id: makeId("aud"),
          timestamp: new Date().toISOString(),
          action,
          status,
          details,
          campaignVersion: nextWorld.stateVersion,
          characterVersion: nextCharacter.stateVersion,
          turnNumber,
          checksumSnapshot: computeChecksum({
            w: nextWorld.stateVersion,
            p: nextCharacter.stateVersion,
            t: turnNumber,
          }),
        },
      ],
    }),
    [],
  );

  const activeDraft = collections.turn_drafts[0] ?? createEmptyTurnDraft();

  const attachSourceContent: ObsidianStoreValue["attachSourceContent"] = useCallback(
    (sourceId, payload) => {
      const now = new Date().toISOString();
      const hasText = payload.content.trim().length > 0;
      const nextSources = collections.sources.map((src) =>
        src.id === sourceId
          ? {
              ...src,
              fileName: payload.fileName,
              content: payload.content,
              originLabel: payload.originLabel.trim() || src.originLabel,
              notes: payload.notes,
              contentStatus: hasText ? ("ATTACHED" as const) : ("NOT_ATTACHED" as const),
              certainty: hasText ? ("KNOWN" as const) : ("UNKNOWN" as const),
              checksum: hasText ? computeChecksum(payload.content) : "EMPTY",
              attachedAt: hasText ? now : null,
            }
          : src,
      );
      const nextWorld: WorldState = {
        ...collections.world_state,
        stateVersion: collections.world_state.stateVersion + 1,
        updatedAt: now,
      };
      const nextAudit = appendAudit(
        collections.audit_log,
        "SOURCE_ATTACHED",
        "OK",
        `Обновлён источник ${sourceId} (${payload.fileName ?? "текст вручную"}). Кампания не запущена автоматически.`,
        nextWorld,
        collections.player_character_state,
      );
      return commitCollections({
        ...collections,
        sources: nextSources,
        world_state: nextWorld,
        audit_log: nextAudit,
      });
    },
    [appendAudit, collections, commitCollections],
  );

  const addSupplementalSource: ObsidianStoreValue["addSupplementalSource"] = useCallback(
    (payload) => {
      const now = new Date().toISOString();
      const hasText = payload.content.trim().length > 0;
      const doc: SourceDocument = {
        id: makeId("src"),
        title: payload.title.trim(),
        type: "SUPPLEMENTAL",
        targetPartition: "CAMPAIGN_STATE",
        originLabel: payload.originLabel.trim() || "Пользовательский источник",
        contentStatus: hasText ? "ATTACHED" : "NOT_ATTACHED",
        certainty: hasText ? "KNOWN" : "UNKNOWN",
        fileName: payload.fileName,
        content: payload.content,
        checksum: hasText ? computeChecksum(payload.content) : "EMPTY",
        attachedAt: hasText ? now : null,
        notes: payload.notes,
      };
      const nextWorld: WorldState = {
        ...collections.world_state,
        stateVersion: collections.world_state.stateVersion + 1,
        updatedAt: now,
      };
      const nextAudit = appendAudit(
        collections.audit_log,
        "SOURCE_ATTACHED",
        "OK",
        `Добавлен дополнительный источник «${doc.title}».`,
        nextWorld,
        collections.player_character_state,
      );
      return commitCollections({
        ...collections,
        sources: [...collections.sources, doc],
        world_state: nextWorld,
        audit_log: nextAudit,
      });
    },
    [appendAudit, collections, commitCollections],
  );

  const addFact: ObsidianStoreValue["addFact"] = useCallback(
    (input) => {
      const now = new Date().toISOString();
      const fact: CanonFact = {
        ...input,
        id: makeId("fact"),
        createdAt: now,
        version: 1,
        history: [],
      };
      return commitCollections({
        ...collections,
        canon_facts: [fact, ...collections.canon_facts],
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
        },
      });
    },
    [collections, commitCollections],
  );

  const amendFact: ObsidianStoreValue["amendFact"] = useCallback(
    (factId, update) => {
      const now = new Date().toISOString();
      const target = collections.canon_facts.find((f) => f.id === factId);
      if (!target) {
        return { ok: false, error: "Факт не найден.", report: lastIntegrityReport };
      }
      if (target.locked && !update.reason.trim()) {
        return {
          ok: false,
          error:
            "Для изменения утверждённого факта укажите причину ревизии (без перезаписи задним числом).",
          report: lastIntegrityReport,
        };
      }
      const nextFacts = collections.canon_facts.map((f) =>
        f.id === factId
          ? {
              ...f,
              statement: update.statement.trim(),
              rationale: update.rationale.trim(),
              certainty: update.certainty,
              version: f.version + 1,
              history: [
                ...f.history,
                {
                  version: f.version,
                  changedAt: now,
                  inGameDate: collections.world_state.currentInGameDate,
                  previousStatement: f.statement,
                  previousCertainty: f.certainty,
                  previousRationale: f.rationale,
                  reason: update.reason.trim() || "Уточнение записи",
                },
              ],
            }
          : f,
      );
      const nextWorld: WorldState = {
        ...collections.world_state,
        stateVersion: collections.world_state.stateVersion + 1,
        updatedAt: now,
      };
      const nextAudit = appendAudit(
        collections.audit_log,
        "FACT_AMENDED",
        "OK",
        `Ревизия факта «${target.title}» (v${target.version} → v${target.version + 1}): ${update.reason.trim() || "уточнение"}`,
        nextWorld,
        collections.player_character_state,
      );
      return commitCollections({
        ...collections,
        canon_facts: nextFacts,
        world_state: nextWorld,
        audit_log: nextAudit,
      });
    },
    [appendAudit, collections, commitCollections, lastIntegrityReport],
  );

  const toggleFactLock: ObsidianStoreValue["toggleFactLock"] = useCallback(
    (factId) => {
      const now = new Date().toISOString();
      return commitCollections({
        ...collections,
        canon_facts: collections.canon_facts.map((f) =>
          f.id === factId ? { ...f, locked: !f.locked } : f,
        ),
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
        },
      });
    },
    [collections, commitCollections],
  );

  const addNpc: ObsidianStoreValue["addNpc"] = useCallback(
    (input) => {
      const now = new Date().toISOString();
      const npc: NpcRecord = {
        ...input,
        id: makeId("npc"),
        knowledge: [],
        version: 1,
        history: [],
      };
      return commitCollections({
        ...collections,
        npcs: [npc, ...collections.npcs],
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
        },
      });
    },
    [collections, commitCollections],
  );

  const amendNpc: ObsidianStoreValue["amendNpc"] = useCallback(
    (npcId, update) => {
      const now = new Date().toISOString();
      const target = collections.npcs.find((n) => n.id === npcId);
      if (!target) return { ok: false, error: "NPC не найден.", report: lastIntegrityReport };
      if (target.locked && !update.reason.trim()) {
        return {
          ok: false,
          error: "Для изменения утверждённого NPC укажите причину обновления состояния.",
          report: lastIntegrityReport,
        };
      }
      const nextNpcs = collections.npcs.map((n) =>
        n.id === npcId
          ? {
              ...n,
              role: update.role,
              locationId: update.locationId,
              factionId: update.factionId,
              goals: update.goals,
              attitudeToPlayer: update.attitudeToPlayer,
              certainty: update.certainty,
              version: n.version + 1,
              history: [
                ...n.history,
                {
                  version: n.version,
                  changedAt: now,
                  inGameDate: collections.world_state.currentInGameDate,
                  summary: `Цели: ${n.goals}; Отношение: ${n.attitudeToPlayer}`,
                  reason: update.reason.trim() || "Обновление состояния NPC",
                },
              ],
            }
          : n,
      );
      const nextWorld: WorldState = {
        ...collections.world_state,
        stateVersion: collections.world_state.stateVersion + 1,
        updatedAt: now,
      };
      const nextAudit = appendAudit(
        collections.audit_log,
        "ENTITY_AMENDED",
        "OK",
        `Обновлён NPC «${target.name}» (v${target.version} → v${target.version + 1}).`,
        nextWorld,
        collections.player_character_state,
      );
      return commitCollections({
        ...collections,
        npcs: nextNpcs,
        world_state: nextWorld,
        audit_log: nextAudit,
      });
    },
    [appendAudit, collections, commitCollections, lastIntegrityReport],
  );

  const addNpcKnowledge: ObsidianStoreValue["addNpcKnowledge"] = useCallback(
    (npcId, entry) => {
      if (!entry.acquisitionPath.trim()) {
        return {
          ok: false,
          error: "NPC не всеведущи: укажите путь/источник получения знания.",
          report: lastIntegrityReport,
        };
      }
      const now = new Date().toISOString();
      const item: NpcKnowledgeEntry = {
        ...entry,
        id: makeId("knw"),
        recordedAt: now,
      };
      return commitCollections({
        ...collections,
        npcs: collections.npcs.map((n) =>
          n.id === npcId ? { ...n, knowledge: [item, ...n.knowledge] } : n,
        ),
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
        },
      });
    },
    [collections, commitCollections, lastIntegrityReport],
  );

  const addFaction: ObsidianStoreValue["addFaction"] = useCallback(
    (input) => {
      const now = new Date().toISOString();
      const faction: FactionRecord = {
        ...input,
        id: makeId("fac"),
        version: 1,
        history: [],
      };
      return commitCollections({
        ...collections,
        factions: [faction, ...collections.factions],
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
        },
      });
    },
    [collections, commitCollections],
  );

  const amendFaction: ObsidianStoreValue["amendFaction"] = useCallback(
    (factionId, update) => {
      const now = new Date().toISOString();
      const target = collections.factions.find((f) => f.id === factionId);
      if (!target) return { ok: false, error: "Фракция не найдена.", report: lastIntegrityReport };
      const nextFactions = collections.factions.map((f) =>
        f.id === factionId
          ? {
              ...f,
              goals: update.goals,
              resources: update.resources,
              standing: update.standing,
              certainty: update.certainty,
              version: f.version + 1,
              history: [
                ...f.history,
                {
                  version: f.version,
                  changedAt: now,
                  inGameDate: collections.world_state.currentInGameDate,
                  summary: `Цели: ${f.goals}; Ресурсы: ${f.resources}; Отношение: ${f.standing}`,
                  reason: update.reason.trim() || "Изменение состояния фракции",
                },
              ],
            }
          : f,
      );
      const nextWorld: WorldState = {
        ...collections.world_state,
        stateVersion: collections.world_state.stateVersion + 1,
        updatedAt: now,
      };
      const nextAudit = appendAudit(
        collections.audit_log,
        "ENTITY_AMENDED",
        "OK",
        `Обновлена фракция «${target.name}» (v${target.version} → v${target.version + 1}).`,
        nextWorld,
        collections.player_character_state,
      );
      return commitCollections({
        ...collections,
        factions: nextFactions,
        world_state: nextWorld,
        audit_log: nextAudit,
      });
    },
    [appendAudit, collections, commitCollections, lastIntegrityReport],
  );

  const addLocation: ObsidianStoreValue["addLocation"] = useCallback(
    (input) => {
      const now = new Date().toISOString();
      const loc: LocationRecord = { ...input, id: makeId("loc") };
      return commitCollections({
        ...collections,
        locations: [loc, ...collections.locations],
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
        },
      });
    },
    [collections, commitCollections],
  );

  const addTravelRoute: ObsidianStoreValue["addTravelRoute"] = useCallback(
    (input) => {
      const now = new Date().toISOString();
      const route: TravelRoute = { ...input, id: makeId("rte") };
      return commitCollections({
        ...collections,
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
          routes: [route, ...collections.world_state.routes],
        },
      });
    },
    [collections, commitCollections],
  );

  const addDelayedEvent: ObsidianStoreValue["addDelayedEvent"] = useCallback(
    (input) => {
      const now = new Date().toISOString();
      const ev: DelayedEvent = { ...input, id: makeId("evt") };
      return commitCollections({
        ...collections,
        timeline_events: [ev, ...collections.timeline_events],
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
        },
      });
    },
    [collections, commitCollections],
  );

  const updateDelayedEventStatus: ObsidianStoreValue["updateDelayedEventStatus"] = useCallback(
    (eventId, status) => {
      const now = new Date().toISOString();
      return commitCollections({
        ...collections,
        timeline_events: collections.timeline_events.map((e) =>
          e.id === eventId ? { ...e, status } : e,
        ),
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
        },
      });
    },
    [collections, commitCollections],
  );

  const addWorldConsequence: ObsidianStoreValue["addWorldConsequence"] = useCallback(
    (input) => {
      const now = new Date().toISOString();
      const item: WorldConsequence = { ...input, id: makeId("csq") };
      return commitCollections({
        ...collections,
        world_state: {
          ...collections.world_state,
          stateVersion: collections.world_state.stateVersion + 1,
          updatedAt: now,
          consequences: [item, ...collections.world_state.consequences],
        },
      });
    },
    [collections, commitCollections],
  );

  const updatePlayerCharacter: ObsidianStoreValue["updatePlayerCharacter"] = useCallback(
    (patch) => {
      const now = new Date().toISOString();
      const nextCharacter: PlayerCharacterState = {
        ...collections.player_character_state,
        ...patch,
        stateVersion: collections.player_character_state.stateVersion + 1,
        updatedAt: now,
      };
      return commitCollections({
        ...collections,
        player_character_state: nextCharacter,
      });
    },
    [collections, commitCollections],
  );

  const addCharacterResource: ObsidianStoreValue["addCharacterResource"] = useCallback(
    (res) => {
      return updatePlayerCharacter({
        resources: [...collections.player_character_state.resources, { ...res, id: makeId("res") }],
      });
    },
    [collections.player_character_state.resources, updatePlayerCharacter],
  );

  const updateCharacterResource: ObsidianStoreValue["updateCharacterResource"] = useCallback(
    (id, current) => {
      return updatePlayerCharacter({
        resources: collections.player_character_state.resources.map((r) =>
          r.id === id ? { ...r, current } : r,
        ),
      });
    },
    [collections.player_character_state.resources, updatePlayerCharacter],
  );

  const addInventoryItem: ObsidianStoreValue["addInventoryItem"] = useCallback(
    (item) => {
      return updatePlayerCharacter({
        inventory: [
          ...collections.player_character_state.inventory,
          { ...item, id: makeId("inv") },
        ],
      });
    },
    [collections.player_character_state.inventory, updatePlayerCharacter],
  );

  const removeInventoryItem: ObsidianStoreValue["removeInventoryItem"] = useCallback(
    (id) => {
      return updatePlayerCharacter({
        inventory: collections.player_character_state.inventory.filter((i) => i.id !== id),
      });
    },
    [collections.player_character_state.inventory, updatePlayerCharacter],
  );

  const updateInventoryItem: ObsidianStoreValue["updateInventoryItem"] = useCallback(
    (id, patch) => {
      return updatePlayerCharacter({
        inventory: collections.player_character_state.inventory.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      });
    },
    [collections.player_character_state.inventory, updatePlayerCharacter],
  );

  const updateCampaignParameters: ObsidianStoreValue["updateCampaignParameters"] = useCallback(
    (patch) => {
      const now = new Date().toISOString();
      const ws = collections.world_state;
      const nextWorld: WorldState = {
        ...ws,
        stateVersion: ws.stateVersion + 1,
        updatedAt: now,
        campaignName: patch.campaignName ?? ws.campaignName,
        calendarSystem: patch.calendarSystem ?? ws.calendarSystem,
        startInGameDate: patch.startInGameDate ?? ws.startInGameDate,
        currentInGameDate:
          collections.session_log.lastTurnNumber === 0 && patch.startInGameDate !== undefined
            ? patch.startInGameDate
            : ws.currentInGameDate,
        startLocationName: patch.startLocationName ?? ws.startLocationName,
        encumbranceMode: patch.encumbranceMode ?? ws.encumbranceMode,
        setup: patch.setupPatch ? { ...ws.setup, ...patch.setupPatch } : ws.setup,
      };
      return commitCollections({ ...collections, world_state: nextWorld });
    },
    [collections, commitCollections],
  );

  const confirmCampaignSetup: ObsidianStoreValue["confirmCampaignSetup"] = useCallback(() => {
    const ws = collections.world_state;
    const pc = collections.player_character_state;
    const s = ws.setup;
    const governingReady = collections.sources.some((source) => source.type === "GOVERNING_DOC" && source.contentStatus === "ATTACHED" && source.content.trim().length > 0);
    const canonReady = collections.sources.some((source) => source.type === "WORLD_CANON" && source.contentStatus === "ATTACHED" && source.content.trim().length > 0);
    if (!governingReady || !canonReady) {
      return {
        ok: false,
        error: "Для запуска обязательны загруженные оригиналы ОБСИДИАН 4.1 и Хроники Экдрасиля. Досье персонажа может быть загружено отдельно или создано вручную.",
        report: lastIntegrityReport,
      };
    }
    if (
      !s.sourcesConfirmed ||
      !s.parametersConfirmed ||
      !s.startPointConfirmed ||
      !s.characterConfirmed ||
      !s.noAutoImportAcknowledged
    ) {
      return {
        ok: false,
        error:
          "Не все шаги мастера подготовки подтверждены. Отметьте все 4 этапа и отказ от автоимпорта.",
        report: lastIntegrityReport,
      };
    }
    if (
      (!ws.encumbranceMode || ws.encumbranceMode === "UNSET") ||
      !ws.campaignName.trim() ||
      ws.startInGameDate.trim() === "" ||
      ws.startInGameDate === "UNKNOWN" ||
      ws.startLocationName.trim() === "" ||
      ws.startLocationName === "UNKNOWN"
    ) {
      return {
        ok: false,
        error:
          "Укажите название кампании, дату, стартовую точку и режим учёта нагрузки перед подтверждением старта.",
        report: lastIntegrityReport,
      };
    }
    if (!pc.name.trim() || pc.name.trim() === "UNKNOWN") {
      return {
        ok: false,
        error:
          "Заполните имя персонажа в отдельном листе игрока (раздел «Персонаж», не UNKNOWN) перед стартом кампании.",
        report: lastIntegrityReport,
      };
    }
    const now = new Date().toISOString();
    const startLocId = collections.locations.find(
      (l) => l.name.toLowerCase() === ws.startLocationName.trim().toLowerCase(),
    )?.id;
    const nextLocations = startLocId
      ? collections.locations
      : [
          {
            id: makeId("loc"),
            name: ws.startLocationName.trim(),
            region: "UNKNOWN",
            description: "Подтверждённая стартовая точка кампании (из мастера настройки).",
            certainty: "KNOWN" as const,
            sourceId: "MANUAL_GM_ENTRY",
          },
          ...collections.locations,
        ];
    const activeLocId = startLocId ?? nextLocations[0]?.id ?? null;

    const nextWorld: WorldState = {
      ...ws,
      stateVersion: ws.stateVersion + 1,
      updatedAt: now,
      currentInGameDate: ws.startInGameDate.trim(),
      currentLocationId: activeLocId,
      setup: {
        ...ws.setup,
        confirmed: true,
        confirmedAt: now,
      },
    };
    const nextCharacter: PlayerCharacterState = {
      ...pc,
      stateVersion: pc.stateVersion + 1,
      updatedAt: now,
      currentLocationLabel: ws.startLocationName.trim(),
    };
    const nextAudit = appendAudit(
      collections.audit_log,
      "SETUP_CONFIRMED",
      "OK",
      `Мастер подготовки подтверждён. Старт: ${ws.startInGameDate} · ${ws.startLocationName}. Персонаж: ${pc.name}.`,
      nextWorld,
      nextCharacter,
    );
    return commitCollections({
      ...collections,
      locations: nextLocations,
      world_state: nextWorld,
      player_character_state: nextCharacter,
      audit_log: nextAudit,
    });
  }, [appendAudit, collections, commitCollections, lastIntegrityReport]);

  const updateTurnDraft: ObsidianStoreValue["updateTurnDraft"] = useCallback(
    (patch) => {
      setCollections((prev) => {
        const current = prev.turn_drafts[0] ?? createEmptyTurnDraft();
        const updated: TurnDraft = {
          ...current,
          ...patch,
          updatedAt: new Date().toISOString(),
          checkedAt: null,
          validationErrors: [],
        };
        const nextDrafts = [updated, ...prev.turn_drafts.slice(1)];
        const storage = resolveStorage();
        if (storage) {
          try {
            storage.setItem(STORAGE_KEYS.turn_drafts, JSON.stringify(nextDrafts));
          } catch {
            // Surface storage errors explicitly on save/commit
          }
        }
        return { ...prev, turn_drafts: nextDrafts };
      });
    },
    [resolveStorage],
  );

  const saveTurnDraftExplicit: ObsidianStoreValue["saveTurnDraftExplicit"] = useCallback(() => {
    return commitCollections(collections);
  }, [collections, commitCollections]);

  const checkTurnDraft: ObsidianStoreValue["checkTurnDraft"] = useCallback(() => {
    const errors = validateTurnDraft(
      activeDraft,
      collections.world_state,
      collections.player_character_state,
    );
    const nextDraft: TurnDraft = {
      ...activeDraft,
      updatedAt: new Date().toISOString(),
      checkedAt: errors.length === 0 ? new Date().toISOString() : null,
      validationErrors: errors,
    };
    const nextDrafts = [nextDraft, ...collections.turn_drafts.slice(1)];
    setCollections((prev) => ({ ...prev, turn_drafts: nextDrafts }));
    const storage = resolveStorage();
    if (storage) {
      try {
        storage.setItem(STORAGE_KEYS.turn_drafts, JSON.stringify(nextDrafts));
      } catch {
        // Handled on commit
      }
    }
    return { ok: errors.length === 0, errors };
  }, [
    activeDraft,
    collections.player_character_state,
    collections.turn_drafts,
    collections.world_state,
    resolveStorage,
  ]);

  const commitTurnDraft: ObsidianStoreValue["commitTurnDraft"] = useCallback(
    (explicitConfirmation) => {
      const ws = collections.world_state;
      const pc = collections.player_character_state;
      if (!ws.setup.confirmed && collections.session_log.lastTurnNumber === 0) {
        return { ok: false, error: "Commit заблокирован: сначала подтвердите Мастер подготовки кампании.", report: lastIntegrityReport };
      }
      if (!activeDraft.checkedAt) {
        return { ok: false, error: "Сначала выполните этап проверки черновика хода.", report: lastIntegrityReport };
      }
      if (!explicitConfirmation) {
        return { ok: false, error: "Требуется явное подтверждение игрока для фиксации хода (commit).", report: lastIntegrityReport };
      }
      const errors = validateTurnDraft(activeDraft, ws, pc);
      if (errors.length > 0) return { ok: false, error: errors.join(" "), report: lastIntegrityReport };

      const now = new Date().toISOString();
      const nextTurnNumber = collections.session_log.lastTurnNumber + 1;
      const nextWorldVersion = ws.stateVersion + 1;
      const nextCharacterVersion = pc.stateVersion + 1;
      const nextDate = activeDraft.newInGameDate.trim() || ws.currentInGameDate;
      const worldChanges: WorldChangeSet = activeDraft.worldChanges ?? {
        facts: [], npcUpdates: [], npcKnowledgeAdditions: [], newLocations: [], newNpcs: [],
        factionUpdates: [], newFactions: [], delayedEvents: [],
      };
      let appliedWorld: ReturnType<typeof applyWorldChangeSet>;
      try {
        appliedWorld = applyWorldChangeSet({
          changes: worldChanges,
          currentLocationId: ws.currentLocationId,
          selectedLocationId: activeDraft.newLocationId.trim() || null,
          selectedLocationKey: activeDraft.newLocationKey ?? null,
          inGameDate: nextDate,
          turnNumber: nextTurnNumber,
          locations: collections.locations,
          npcs: collections.npcs,
          factions: collections.factions,
          now,
          makeId,
        });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Не удалось применить изменения мира.",
          report: lastIntegrityReport,
        };
      }
      const nextLocationId = appliedWorld.currentLocationId;
      const nextLocationObj = appliedWorld.locations.find((location) => location.id === nextLocationId);

      const manualFact: CanonFact | null =
        activeDraft.newFactTitle.trim() && activeDraft.newFactStatement.trim()
          ? {
              id: makeId("fact"),
              title: activeDraft.newFactTitle.trim(),
              statement: activeDraft.newFactStatement.trim(),
              rationale: activeDraft.newFactRationale.trim() || `Зафиксировано в ходе №${nextTurnNumber}`,
              layer: activeDraft.newFactLayer,
              subjectNpcId: null,
              certainty: activeDraft.newFactCertainty,
              sourceId: activeDraft.newFactSourceId,
              acquisitionPath: `Зафиксировано в ходе №${nextTurnNumber}`,
              inGameDate: nextDate,
              scope: "LOCATION",
              locked: true,
              createdAt: now,
              version: 1,
              history: [],
            }
          : null;
      const nextFacts = [
        ...appliedWorld.canonFacts,
        ...(manualFact ? [manualFact] : []),
        ...collections.canon_facts,
      ];
      const nextConsequences = activeDraft.consequenceText.trim()
        ? [{
            id: makeId("csq"), summary: activeDraft.consequenceText.trim(), inGameDate: nextDate,
            turnNumber: nextTurnNumber, certainty: "KNOWN" as const, sourceId: "MANUAL_GM_ENTRY",
          }, ...ws.consequences]
        : ws.consequences;
      const nextWorld: WorldState = {
        ...ws,
        stateVersion: nextWorldVersion,
        updatedAt: now,
        currentInGameDate: nextDate,
        elapsedMinutes: ws.elapsedMinutes + activeDraft.timeDeltaMinutes,
        currentLocationId: nextLocationId,
        routes: [...ws.routes, ...appliedWorld.routes],
        consequences: nextConsequences,
      };

      const nextHp = pc.hpCurrent !== null ? pc.hpCurrent + activeDraft.hpDelta : null;
      const characterChanges: CharacterChangeSet = activeDraft.characterChanges ?? {
        inventory: [], resources: [], conditions: [], currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      };
      let nextInventory = [...pc.inventory];
      for (const change of characterChanges.inventory) {
        const existingIndex = nextInventory.findIndex((item) => item.name.toLocaleLowerCase() === change.name.toLocaleLowerCase());
        if (change.action === "ADD") {
          if (existingIndex >= 0) {
            const existing = nextInventory[existingIndex]!;
            nextInventory[existingIndex] = { ...existing, quantity: existing.quantity + change.quantity, notes: change.notes || existing.notes, certainty: change.certainty };
          } else {
            nextInventory.push({ id: makeId("item"), name: change.name, quantity: change.quantity, notes: change.notes, certainty: change.certainty, location: "OTHER", unitWeightLb: null });
          }
        } else if (change.action === "REMOVE" && existingIndex >= 0) {
          const existing = nextInventory[existingIndex]!;
          const remaining = existing.quantity - change.quantity;
          nextInventory = remaining > 0
            ? nextInventory.map((item, index) => index === existingIndex ? { ...item, quantity: remaining } : item)
            : nextInventory.filter((_, index) => index !== existingIndex);
        } else if (change.action === "SET") {
          if (change.quantity === 0) nextInventory = nextInventory.filter((_, index) => index !== existingIndex);
          else if (existingIndex >= 0) nextInventory[existingIndex] = { ...nextInventory[existingIndex]!, quantity: change.quantity, notes: change.notes, certainty: change.certainty };
          else nextInventory.push({ id: makeId("item"), name: change.name, quantity: change.quantity, notes: change.notes, certainty: change.certainty, location: "OTHER", unitWeightLb: null });
        }
      }
      const nextResources = [...pc.resources];
      for (const change of characterChanges.resources) {
        const existingIndex = nextResources.findIndex((resource) => resource.name.toLocaleLowerCase() === change.name.toLocaleLowerCase());
        const updated = { name: change.name, current: change.current, max: change.max, recovery: change.recovery, certainty: change.certainty };
        if (existingIndex >= 0) nextResources[existingIndex] = { ...nextResources[existingIndex]!, ...updated };
        else nextResources.push({ id: makeId("res"), ...updated });
      }
      let nextConditions = [...pc.conditions];
      for (const change of characterChanges.conditions) {
        if (change.action === "ADD" && !nextConditions.includes(change.name)) nextConditions.push(change.name);
        if (change.action === "REMOVE") nextConditions = nextConditions.filter((condition) => condition !== change.name);
      }
      const baseCurrency = pc.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
      const nextCurrency = {
        cp: baseCurrency.cp + characterChanges.currencyDelta.cp,
        sp: baseCurrency.sp + characterChanges.currencyDelta.sp,
        ep: baseCurrency.ep + characterChanges.currencyDelta.ep,
        gp: baseCurrency.gp + characterChanges.currencyDelta.gp,
        pp: baseCurrency.pp + characterChanges.currencyDelta.pp,
      };
      const nextCharacter: PlayerCharacterState = {
        ...pc,
        stateVersion: nextCharacterVersion,
        updatedAt: now,
        hpCurrent: nextHp,
        inventory: nextInventory,
        resources: nextResources,
        conditions: nextConditions,
        currency: pc.currency || Object.values(characterChanges.currencyDelta).some((delta) => delta !== 0) ? nextCurrency : undefined,
        currentLocationLabel: nextLocationObj?.name ?? pc.currentLocationLabel,
      };
      const baseTurnPayload = {
        id: makeId("turn"),
        entryType: "GAME_TURN" as const,
        turnNumber: nextTurnNumber,
        committedAt: now,
        inGameDateBefore: ws.currentInGameDate,
        inGameDateAfter: nextDate,
        timeDeltaMinutes: activeDraft.timeDeltaMinutes,
        summary: activeDraft.summary.trim(),
        playerIntent: activeDraft.playerIntent.trim(),
        worldOutcome: activeDraft.worldOutcome.trim(),
        gmNarration: activeDraft.gmNarration?.trim() ?? "",
        characterChanges,
        worldChanges,
        newLocationKey: activeDraft.newLocationKey ?? null,
        locationIdAfter: nextLocationId,
        hpDelta: activeDraft.hpDelta,
        rolls: activeDraft.rolls,
        affectedCampaignVersion: nextWorldVersion,
        affectedCharacterVersion: nextCharacterVersion,
      };
      const turnEntry: GameTurnEntry = { ...baseTurnPayload, entryChecksum: computeChecksum(baseTurnPayload) };
      const nextSessionLog: SessionLogState = {
        ...collections.session_log,
        lastTurnNumber: nextTurnNumber,
        entries: [...collections.session_log.entries, turnEntry],
      };
      const auditDetails = [
        `Зафиксирован ход №${nextTurnNumber}: ${turnEntry.summary} (+${turnEntry.timeDeltaMinutes} мин).`,
        `Изменения мира: факты ${appliedWorld.counts.facts}, NPC ${appliedWorld.counts.npcUpdates + appliedWorld.counts.newNpcs}, знания NPC ${appliedWorld.counts.npcKnowledge}, фракции ${appliedWorld.counts.factionUpdates + appliedWorld.counts.newFactions}, локации ${appliedWorld.counts.newLocations}, отложенные события ${appliedWorld.counts.delayedEvents}.`,
      ].join(" ");
      const nextAudit = appendAudit(
        collections.audit_log, "TURN_COMMITTED", "OK", auditDetails,
        nextWorld, nextCharacter, nextTurnNumber,
      );
      return commitCollections({
        ...collections,
        canon_facts: nextFacts,
        world_state: nextWorld,
        player_character_state: nextCharacter,
        npcs: appliedWorld.npcs,
        factions: appliedWorld.factions,
        locations: appliedWorld.locations,
        timeline_events: [...collections.timeline_events, ...appliedWorld.timelineEvents],
        turn_drafts: [createEmptyTurnDraft(makeId("draft"))],
        session_log: nextSessionLog,
        audit_log: nextAudit,
      }, nextTurnNumber);
    },
    [activeDraft, appendAudit, collections, commitCollections, lastIntegrityReport],
  );

  const addTechnicalMessage: ObsidianStoreValue["addTechnicalMessage"] = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: "Введите текст технического сообщения.",
          report: lastIntegrityReport,
        };
      }
      const note: TechnicalMessageEntry = {
        id: makeId("tech"),
        entryType: "TECHNICAL_NOTE",
        recordedAt: new Date().toISOString(),
        inGameDateSnapshot: collections.world_state.currentInGameDate,
        text: trimmed,
        advancesTime: false,
      };
      const nextSessionLog: SessionLogState = {
        ...collections.session_log,
        entries: [...collections.session_log.entries, note],
      };
      const nextAudit = appendAudit(
        collections.audit_log,
        "TECHNICAL_NOTE_ADDED",
        "OK",
        "Добавлено техническое сообщение (не игровой ход, время не сдвинуто).",
        collections.world_state,
        collections.player_character_state,
        null,
      );
      return commitCollections({
        ...collections,
        session_log: nextSessionLog,
        audit_log: nextAudit,
      });
    },
    [appendAudit, collections, commitCollections, lastIntegrityReport],
  );

  const runAuditNow = useCallback(() => {
    const storage = resolveStorage();
    const loaded = loadAllCollections(storage);
    const report = runIntegrityAudit(loaded);
    setLastIntegrityReport(report);
    return report;
  }, [resolveStorage]);

  const exportBackupJson = useCallback(() => {
    return buildBackupEnvelope(collections);
  }, [collections]);

  const importBackupJson: ObsidianStoreValue["importBackupJson"] = useCallback(
    (rawJson) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        return {
          ok: false,
          error: "Некорректный JSON-файл резервной копии.",
          report: lastIntegrityReport,
        };
      }
      const validated = validateBackupEnvelope(parsed);
      if (!validated.ok) {
        return { ok: false, error: validated.error, report: lastIntegrityReport };
      }
      const c = validated.envelope.collections;
      const nextAudit = appendAudit(
        c.audit_log,
        "BACKUP_IMPORTED",
        "OK",
        `Импортирована резервная копия от ${validated.envelope.exportedAt}.`,
        c.world_state,
        c.player_character_state,
        c.session_log.lastTurnNumber || null,
      );
      return commitCollections({
        ...c,
        turn_drafts: c.turn_drafts.length > 0 ? c.turn_drafts : [createEmptyTurnDraft()],
        audit_log: nextAudit,
      });
    },
    [appendAudit, commitCollections, lastIntegrityReport],
  );

  const value = useMemo<ObsidianStoreValue>(
    () => ({
      hydrated,
      collections,
      sources: collections.sources,
      canonFacts: collections.canon_facts,
      worldState: collections.world_state,
      character: collections.player_character_state,
      npcs: collections.npcs,
      factions: collections.factions,
      locations: collections.locations,
      timelineEvents: collections.timeline_events,
      turnDrafts: collections.turn_drafts,
      turnDraft: activeDraft,
      sessionLog: collections.session_log,
      auditLog: collections.audit_log,
      lastIntegrityReport,
      lastStorageError,
      attachSourceContent,
      addSupplementalSource,
      addFact,
      amendFact,
      toggleFactLock,
      addNpc,
      amendNpc,
      addNpcKnowledge,
      addFaction,
      amendFaction,
      addLocation,
      addTravelRoute,
      addDelayedEvent,
      updateDelayedEventStatus,
      addWorldConsequence,
      updatePlayerCharacter,
      addCharacterResource,
      updateCharacterResource,
      addInventoryItem,
      removeInventoryItem,
      updateInventoryItem,
      updateCampaignParameters,
      confirmCampaignSetup,
      updateTurnDraft,
      saveTurnDraftExplicit,
      checkTurnDraft,
      commitTurnDraft,
      addTechnicalMessage,
      runAuditNow,
      exportBackupJson,
      importBackupJson,
    }),
    [
      hydrated,
      collections,
      activeDraft,
      lastIntegrityReport,
      lastStorageError,
      attachSourceContent,
      addSupplementalSource,
      addFact,
      amendFact,
      toggleFactLock,
      addNpc,
      amendNpc,
      addNpcKnowledge,
      addFaction,
      amendFaction,
      addLocation,
      addTravelRoute,
      addDelayedEvent,
      updateDelayedEventStatus,
      addWorldConsequence,
      updatePlayerCharacter,
      addCharacterResource,
      updateCharacterResource,
      addInventoryItem,
      removeInventoryItem,
      updateInventoryItem,
      updateCampaignParameters,
      confirmCampaignSetup,
      updateTurnDraft,
      saveTurnDraftExplicit,
      checkTurnDraft,
      commitTurnDraft,
      addTechnicalMessage,
      runAuditNow,
      exportBackupJson,
      importBackupJson,
    ],
  );

  return <ObsidianStoreContext.Provider value={value}>{children}</ObsidianStoreContext.Provider>;
}

export function useObsidianStore(): ObsidianStoreValue {
  const ctx = useContext(ObsidianStoreContext);
  if (!ctx) throw new Error("useObsidianStore must be used within ObsidianStoreProvider");
  return ctx;
}