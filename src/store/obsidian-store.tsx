import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createEmptyTurnDraft, createInitialCollections, DEFAULT_SOURCE_IDS } from "@/domain/defaults";
import { applyEkdrasilSeed, loadEkdrasilSeed } from "@/domain/campaign-seed";
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
  SourceProcessingSummary,
  SourceReviewStatus,
  TechnicalMessageEntry,
  TravelRoute,
  TurnDraft,
  WorldConsequence,
  WorldState,
} from "@/domain/types";

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface CampaignParametersPatch {
  campaignName?: string;
  calendarSystem?: string;
  startInGameDate?: string;
  startLocationName?: string;
  startNarrative?: string;
  startGeneration?: WorldState["startGeneration"];
  encumbranceMode?: WorldState["encumbranceMode"];
  campaignPreferences?: WorldState["campaignPreferences"];
  setupPatch?: Partial<Omit<CampaignSetupState, "confirmed" | "confirmedAt">>;
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
    payload: { fileName: string | null; content: string; originLabel: string; notes: string; processing?: SourceProcessingSummary; canonSections?: SourceDocument["canonSections"]; dateMentions?: SourceDocument["dateMentions"] },
  ) => PersistVerifyResult;
  addSupplementalSource: (payload: {
    title: string;
    originLabel: string;
    content: string;
    fileName: string | null;
    notes: string;
  }) => PersistVerifyResult;
  verifySource: (sourceId: string) => PersistVerifyResult;
  setSourceContextEnabled: (sourceId: string, enabled: boolean) => PersistVerifyResult;

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
  applyGeneratedStart: (input: {
    city: { name: string; region: string; continent: string; population: number };
    date: string;
    narrative: string;
    locationDescription: string;
    generationRecord: NonNullable<WorldState["startGeneration"]>;
    characterPatch: Partial<Omit<PlayerCharacterState, "schemaVersion" | "stateVersion" | "updatedAt">>;
    inventory: Array<Omit<InventoryItem, "id">>;
  }) => PersistVerifyResult;
  updateCampaignParameters: (patch: CampaignParametersPatch) => PersistVerifyResult;
  confirmCampaignSetup: (patch?: CampaignParametersPatch) => PersistVerifyResult;
  resetForTrialCampaign: () => PersistVerifyResult;

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
    let cancelled = false;

    async function hydrate() {
      const storage = resolveStorage();
      const loaded = loadAllCollections(storage);
      if (loaded.turn_drafts.length === 0) {
        loaded.turn_drafts = [createEmptyTurnDraft()];
      }

      // Test/custom stores stay isolated; the production browser gets the bundled Ekdrasil pack.
      if (storageOverride) {
        if (!cancelled) {
          setCollections(loaded);
          setLastIntegrityReport(runIntegrityAudit(loaded));
          setHydrated(true);
        }
        return;
      }

      try {
        const bundle = await loadEkdrasilSeed();
        const seeded = await applyEkdrasilSeed(loaded, bundle);
        if (cancelled) return;

        const persisted = persistAndVerifyCollections(storage, seeded);
        setCollections(seeded);
        if (persisted.ok) {
          setLastIntegrityReport(persisted.report);
          setLastStorageError(null);
        } else {
          setLastIntegrityReport(persisted.report ?? runIntegrityAudit(seeded));
          setLastStorageError(persisted.error);
        }
      } catch (error) {
        if (cancelled) return;
        setCollections(loaded);
        setLastIntegrityReport(runIntegrityAudit(loaded));
        setLastStorageError(
          error instanceof Error
            ? `Не удалось автоматически подключить встроенный пакет Экдрасиля: ${error.message}`
            : "Не удалось автоматически подключить встроенный пакет Экдрасиля.",
        );
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [resolveStorage, storageOverride]);

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
              reviewStatus: "UNREVIEWED" as const,
              contextEnabled: false,
              certainty: hasText ? ("KNOWN" as const) : ("UNKNOWN" as const),
              checksum: hasText ? computeChecksum(payload.content) : "EMPTY",
              attachedAt: hasText ? now : null,
              ...(payload.processing ? { processing: payload.processing } : src.processing ? { processing: src.processing } : {}),
              ...(payload.canonSections ? { canonSections: payload.canonSections } : src.type === "WORLD_CANON" ? { canonSections: [] } : src.canonSections ? { canonSections: src.canonSections } : {}),
              ...(payload.dateMentions ? { dateMentions: payload.dateMentions } : src.type === "WORLD_CANON" ? { dateMentions: [] } : src.dateMentions ? { dateMentions: src.dateMentions } : {}),
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
        reviewStatus: "UNREVIEWED",
        contextEnabled: false,
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

  const verifySource: ObsidianStoreValue["verifySource"] = useCallback(
    (sourceId) => {
      const target = collections.sources.find((source) => source.id === sourceId);
      if (!target) return { ok: false, error: "Источник не найден.", report: lastIntegrityReport };
      if (target.contentStatus !== "ATTACHED" || !target.content.trim()) {
        return { ok: false, error: "Нельзя проверить источник без загруженного содержимого.", report: lastIntegrityReport };
      }
      if (target.processing?.status !== "PROCESSED" || !target.processing.sha256) {
        return { ok: false, error: "Сначала обработайте источник и проверьте SHA-256.", report: lastIntegrityReport };
      }
      const now = new Date().toISOString();
      const nextWorld: WorldState = {
        ...collections.world_state,
        stateVersion: collections.world_state.stateVersion + 1,
        updatedAt: now,
      };
      const nextAudit = appendAudit(
        collections.audit_log,
        "SOURCE_VERIFIED",
        "OK",
        `Пользователь подтвердил содержимое источника «${target.title}» (SHA-256 ${target.processing.sha256}).`,
        nextWorld,
        collections.player_character_state,
      );
      return commitCollections({
        ...collections,
        sources: collections.sources.map((source) =>
          source.id === sourceId ? { ...source, reviewStatus: "VERIFIED" as SourceReviewStatus } : source,
        ),
        world_state: nextWorld,
        audit_log: nextAudit,
      });
    },
    [appendAudit, collections, commitCollections, lastIntegrityReport],
  );

  const setSourceContextEnabled: ObsidianStoreValue["setSourceContextEnabled"] = useCallback(
    (sourceId, enabled) => {
      const target = collections.sources.find((source) => source.id === sourceId);
      if (!target) return { ok: false, error: "Источник не найден.", report: lastIntegrityReport };
      if (enabled && (
        target.contentStatus !== "ATTACHED" ||
        target.processing?.status !== "PROCESSED" ||
        target.reviewStatus !== "VERIFIED"
      )) {
        return {
          ok: false,
          error: "В контекст ИИ можно включить только загруженный, обработанный и отдельно проверенный источник.",
          report: lastIntegrityReport,
        };
      }
      if (target.contextEnabled === enabled) {
        return { ok: true, report: lastIntegrityReport ?? runIntegrityAudit(collections) };
      }
      const now = new Date().toISOString();
      const nextWorld: WorldState = {
        ...collections.world_state,
        stateVersion: collections.world_state.stateVersion + 1,
        updatedAt: now,
      };
      const nextAudit = appendAudit(
        collections.audit_log,
        "SOURCE_CONTEXT_CHANGED",
        "OK",
        `Источник «${target.title}»: контекст ИИ ${enabled ? "включён" : "отключён"}.`,
        nextWorld,
        collections.player_character_state,
      );
      return commitCollections({
        ...collections,
        sources: collections.sources.map((source) =>
          source.id === sourceId ? { ...source, contextEnabled: enabled } : source,
        ),
        world_state: nextWorld,
        audit_log: nextAudit,
      });
    },
    [appendAudit, collections, commitCollections, lastIntegrityReport],
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
        resources: input.resources ?? "UNKNOWN",
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
      const nextAudit = appendAudit(
        collections.audit_log,
        "PLAYER_CHARACTER_UPDATED",
        "OK",
        "Лист персонажа обновлён вне игрового хода; игровое время не продвигалось.",
        collections.world_state,
        nextCharacter,
      );
      return commitCollections({
        ...collections,
        player_character_state: nextCharacter,
        audit_log: nextAudit,
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
      const existing = collections.player_character_state.resources.find((resource) => resource.id === id);
      if (!existing) return { ok: false, error: "Ресурс не найден в листе персонажа.", report: lastIntegrityReport };
      if (current === null || !Number.isInteger(current) || current < 0 || (existing.max !== null && current > existing.max)) {
        return { ok: false, error: "Текущее количество ресурса должно быть целым числом от 0 до его максимума.", report: lastIntegrityReport };
      }
      return updatePlayerCharacter({
        resources: collections.player_character_state.resources.map((resource) =>
          resource.id === id ? { ...resource, current } : resource,
        ),
      });
    },
    [collections.player_character_state.resources, lastIntegrityReport, updatePlayerCharacter],
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

  const applyGeneratedStart: ObsidianStoreValue["applyGeneratedStart"] = useCallback((input) => {
    if (collections.world_state.setup.confirmed || collections.session_log.lastTurnNumber > 0) {
      return { ok: false, error: "Случайный старт можно создать только до подтверждения кампании и первого игрового хода.", report: lastIntegrityReport };
    }
    const now = new Date().toISOString();
    const locationId = makeId("loc");
    const location: LocationRecord = {
      id: locationId,
      name: input.city.name,
      region: input.city.region,
      description: input.locationDescription,
      certainty: "KNOWN",
      sourceId: "src-ekdrasil-chronicle",
    };
    const previousCharacter = collections.player_character_state;
    const nextCharacter: PlayerCharacterState = {
      ...previousCharacter,
      ...input.characterPatch,
      stateVersion: previousCharacter.stateVersion + 1,
      currentLocationLabel: input.city.name,
      inventory: input.inventory.length > 0 ? input.inventory.map((item) => ({ ...item, id: makeId("inv") })) : previousCharacter.inventory,
      updatedAt: now,
    };
    const previousWorld = collections.world_state;
    const nextWorld: WorldState = {
      ...previousWorld,
      stateVersion: previousWorld.stateVersion + 1,
      campaignName: previousWorld.campaignName || "Экдрасиль — свободная кампания",
      calendarSystem: previousWorld.calendarSystem === "UNKNOWN"
        ? "Хронология Экдрасиля; точная календарная система UNKNOWN"
        : previousWorld.calendarSystem,
      startInGameDate: input.date,
      currentInGameDate: input.date,
      startLocationName: input.city.name,
      currentLocationId: locationId,
      startNarrative: input.narrative,
      startGeneration: input.generationRecord,
      setup: {
        ...previousWorld.setup,
        parametersConfirmed: false,
        startPointConfirmed: false,
        characterConfirmed: false,
        noAutoImportAcknowledged: false,
        confirmed: false,
        confirmedAt: null,
      },
      updatedAt: now,
    };
    return commitCollections({
      ...collections,
      locations: [location, ...collections.locations.filter((item) => item.name.toLocaleLowerCase() !== input.city.name.toLocaleLowerCase())],
      world_state: nextWorld,
      player_character_state: nextCharacter,
    });
  }, [collections, commitCollections, lastIntegrityReport]);

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
        ...(patch.startNarrative !== undefined ? { startNarrative: patch.startNarrative } : {}),
        ...(patch.startGeneration !== undefined ? { startGeneration: patch.startGeneration } : {}),
        encumbranceMode: patch.encumbranceMode ?? ws.encumbranceMode,
        ...((patch.campaignPreferences ?? ws.campaignPreferences) !== undefined
          ? { campaignPreferences: patch.campaignPreferences ?? ws.campaignPreferences }
          : {}),
        setup: patch.setupPatch ? { ...ws.setup, ...patch.setupPatch } : ws.setup,
      };
      return commitCollections({ ...collections, world_state: nextWorld });
    },
    [collections, commitCollections],
  );

  const resetForTrialCampaign: ObsidianStoreValue["resetForTrialCampaign"] = useCallback(() => {
    const now = new Date().toISOString();
    const blank = createInitialCollections();
    const { currency: _oldCurrency, ...characterWithoutCurrency } = collections.player_character_state;
    const next: ObsidianCollections = {
      ...blank,
      // Preserve verified source documents and the isolated player dossier import.
      sources: collections.sources
        .filter((source) =>
          source.id === DEFAULT_SOURCE_IDS.GOVERNING ||
          source.id === DEFAULT_SOURCE_IDS.CANON ||
          source.id === DEFAULT_SOURCE_IDS.DOSSIER ||
          source.id === DEFAULT_SOURCE_IDS.SRD ||
          (source.type === "SUPPLEMENTAL" && /SRD\s*5\.2\.1|D&D\s*2024|DND\s*2024/i.test(`${source.title} ${source.originLabel} ${source.fileName ?? ""}`) && source.reviewStatus === "VERIFIED" && source.contextEnabled),
        )
        .map((source) => source.id === DEFAULT_SOURCE_IDS.SRD &&
          (source.reviewStatus !== "VERIFIED" || source.processing?.status !== "PROCESSED")
          ? { ...source, contextEnabled: false }
          : source),
      player_character_state: {
        ...characterWithoutCurrency,
        stateVersion: collections.player_character_state.stateVersion + 1,
        hpCurrent: null,
        hpTemp: null,
        currentLocationLabel: "UNKNOWN",
        conditions: [],
        resources: collections.player_character_state.resources.map((resource) => ({ ...resource, current: null })),
        inventory: [],
        notes: "",
        updatedAt: now,
      },
      audit_log: {
        ...blank.audit_log,
        entries: [{
          id: makeId("aud"),
          timestamp: now,
          action: "CAMPAIGN_RESET_FOR_TRIAL",
          status: "OK",
          details: "Создано чистое состояние пробной кампании. Источники и PLAYER_CHARACTER_STATE сохранены; старые NPC, фракции, локации, факты, события, ходы и журнал не перенесены. Перед сбросом пользователь подтвердил создание резервной копии.",
          campaignVersion: blank.world_state.stateVersion,
          characterVersion: collections.player_character_state.stateVersion + 1,
          turnNumber: null,
          checksumSnapshot: computeChecksum({
            resetAt: now,
            preservedSourceIds: collections.sources.map((source) => source.id),
            characterVersion: collections.player_character_state.stateVersion + 1,
          }),
        }],
      },
    };
    return commitCollections(next);
  }, [collections, commitCollections]);

  const confirmCampaignSetup: ObsidianStoreValue["confirmCampaignSetup"] = useCallback((patch = {}) => {
    const currentWorld = collections.world_state;
    const ws: WorldState = {
      ...currentWorld,
      campaignName: patch.campaignName ?? currentWorld.campaignName,
      calendarSystem: patch.calendarSystem ?? currentWorld.calendarSystem,
      startInGameDate: patch.startInGameDate ?? currentWorld.startInGameDate,
      startLocationName: patch.startLocationName ?? currentWorld.startLocationName,
      ...(patch.startNarrative !== undefined ? { startNarrative: patch.startNarrative } : {}),
      ...(patch.startGeneration !== undefined ? { startGeneration: patch.startGeneration } : {}),
      encumbranceMode: patch.encumbranceMode ?? currentWorld.encumbranceMode,
      ...((patch.campaignPreferences ?? currentWorld.campaignPreferences) !== undefined
        ? { campaignPreferences: patch.campaignPreferences ?? currentWorld.campaignPreferences }
        : {}),
      setup: patch.setupPatch ? { ...currentWorld.setup, ...patch.setupPatch } : currentWorld.setup,
    };
    const pc = collections.player_character_state;
    const s = ws.setup;
    const isVerifiedContextSource = (source: SourceDocument, type: SourceDocument["type"]) =>
      source.type === type &&
      source.contentStatus === "ATTACHED" &&
      source.content.trim().length > 0 &&
      source.processing?.status === "PROCESSED" &&
      source.reviewStatus === "VERIFIED" &&
      source.contextEnabled === true;
    const governingReady = collections.sources.some((source) => isVerifiedContextSource(source, "GOVERNING_DOC"));
    const canonReady = collections.sources.some((source) => isVerifiedContextSource(source, "WORLD_CANON"));
    const dossierReady = collections.sources.some((source) => isVerifiedContextSource(source, "PLAYER_DOSSIER"));
    if (!governingReady || !canonReady || !dossierReady) {
      return {
        ok: false,
        error: "Для запуска нужны три отдельные проверенные и включённые в контекст ИИ версии: ОБСИДИАН 4.1, Хроника Экдрасиля и досье персонажа. Каждый файл должен быть обработан, вручную подтверждён и явно включён в контекст.",
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
    const preferenceValues = Object.values(ws.campaignPreferences ?? {});
    if (preferenceValues.length !== 10 || preferenceValues.some((value) => !value.trim())) {
      return { ok: false, error: "Не согласованы все настройки Приложения B: книги и опциональные правила, броски, прогрессия, питание/жажда, случайные встречи, PvP, смерть/воскрешение, экономика, границы содержания и домашние правила. Для неиспользуемого пункта явно укажи «Не используется».", report: lastIntegrityReport };
    }
    if (!pc.name.trim() || pc.name.trim() === "UNKNOWN") {
      return {
        ok: false,
        error:
          "Заполните имя персонажа в отдельном листе игрока (раздел «Персонаж», не UNKNOWN) перед стартом кампании.",
        report: lastIntegrityReport,
      };
    }    const missingCombatFields = [
      pc.hpCurrent === null ? "текущие HP" : "",
      pc.hpMax === null ? "максимальные HP" : "",
      pc.armorClass === null ? "КД" : "",
      pc.level === null ? "уровень" : "",
      pc.proficiencyBonus === null || pc.proficiencyBonus === undefined ? "бонус мастерства" : "",
      !pc.abilityScores ? "шесть характеристик" : "",
      !pc.speciesAndClass.trim() || pc.speciesAndClass === "UNKNOWN" ? "вид и класс" : "",
      !pc.baseSavingThrowBonuses ? "базовые спасброски" : "",
      !pc.skillBonuses?.length ? "владения навыками" : "",
      !pc.weaponAttacks?.length ? "параметры атак" : "",
      !pc.classFeaturesByLevel?.length ? "классовые особенности" : "",
    ].filter(Boolean);
    if (missingCombatFields.length) {
      return { ok: false, error: "Лист персонажа не готов к механическому разрешению действий: не заполнено — " +
        missingCombatFields.join(", ") + ". Досье не содержит текущие HP; введи фактическое значение вручную, не подставляй максимум автоматически.",
        report: lastIntegrityReport };
    }
    if (pc.hpCurrent! > pc.hpMax!) {
      return { ok: false, error: "Текущие HP не могут превышать максимум HP.", report: lastIntegrityReport };
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
      stateVersion: currentWorld.stateVersion + 1,
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
      collections.npcs,
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
      if (!ws.setup.confirmed) {
        return {
          ok: false,
          error: "Commit заблокирован: сначала подтвердите Мастер подготовки кампании.",
          report: lastIntegrityReport,
        };
      }
      if (!activeDraft.checkedAt) {
        return {
          ok: false,
          error: "Сначала выполните этап проверки черновика хода.",
          report: lastIntegrityReport,
        };
      }
      if (!explicitConfirmation) {
        return {
          ok: false,
          error: "Требуется явное подтверждение игрока для фиксации хода (commit).",
          report: lastIntegrityReport,
        };
      }
      const errors = validateTurnDraft(activeDraft, ws, pc);
      if (errors.length > 0) {
        return { ok: false, error: errors.join(" "), report: lastIntegrityReport };
      }

      const now = new Date().toISOString();
      const nextTurnNumber = collections.session_log.lastTurnNumber + 1;
      const nextWorldVersion = ws.stateVersion + 1;
      const nextCharacterVersion = pc.stateVersion + 1;
      const nextDate = activeDraft.newInGameDate.trim() || ws.currentInGameDate;
      const nextLocationId = activeDraft.newLocationId || ws.currentLocationId;
      const nextLocationObj = collections.locations.find((l) => l.id === nextLocationId);
      const nextNpcs = [...collections.npcs];
      for (const change of activeDraft.npcChanges ?? []) {
        const existingIndex = nextNpcs.findIndex((npc) => npc.name.toLocaleLowerCase() === change.name.toLocaleLowerCase());
        const locationId = change.locationName
          ? collections.locations.find((location) => location.name.toLocaleLowerCase() === change.locationName!.toLocaleLowerCase())?.id ?? null
          : null;
        const factionId = change.factionName
          ? collections.factions.find((faction) => faction.name.toLocaleLowerCase() === change.factionName!.toLocaleLowerCase())?.id ?? null
          : null;
        const knowledge = change.knowledgeAdditions.map((entry) => ({
          id: makeId("know"), factSummary: entry.factSummary, sourceId: "MANUAL_GM_ENTRY",
          acquisitionPath: entry.acquisitionPath, inGameDate: nextDate, certainty: entry.certainty, recordedAt: now,
        }));
        if (change.action === "CREATE") {
          nextNpcs.unshift({
            id: makeId("npc"), name: change.name, role: change.role, locationId, factionId,
            goals: change.goals, resources: change.resources, attitudeToPlayer: change.attitudeToPlayer, certainty: change.certainty,
            sourceId: "MANUAL_GM_ENTRY", locked: false, knowledge, version: 1, history: [],
          });
        } else if (existingIndex >= 0) {
          const existing = nextNpcs[existingIndex]!;
          nextNpcs[existingIndex] = {
            ...existing, role: change.role, locationId: locationId ?? existing.locationId,
            factionId: factionId ?? existing.factionId, goals: change.goals, resources: change.resources,
            attitudeToPlayer: change.attitudeToPlayer, certainty: change.certainty,
            knowledge: [...existing.knowledge, ...knowledge], version: existing.version + 1,
            history: [...existing.history, {
              version: existing.version, changedAt: now, inGameDate: nextDate,
              summary: `Цели: ${existing.goals}; ресурсы: ${existing.resources ?? "UNKNOWN"}; отношение: ${existing.attitudeToPlayer}`,
              reason: change.reason,
            }],
          };
        }
      }

      const nextFacts =
        activeDraft.newFactTitle.trim() && activeDraft.newFactStatement.trim()
          ? [
              {
                id: makeId("fact"),
                title: activeDraft.newFactTitle.trim(),
                statement: activeDraft.newFactStatement.trim(),
                rationale:
                  activeDraft.newFactRationale.trim() || `Зафиксировано в ходе №${nextTurnNumber}`,
                layer: activeDraft.newFactLayer,
                subjectNpcId: null,
                certainty: activeDraft.newFactCertainty,
                sourceId: activeDraft.newFactSourceId,
                acquisitionPath: `Зафиксировано в ходе №${nextTurnNumber}`,
                inGameDate: nextDate,
                scope: "LOCATION" as const,
                locked: true,
                createdAt: now,
                version: 1,
                history: [],
              },
              ...collections.canon_facts,
            ]
          : collections.canon_facts;

      const nextConsequences = activeDraft.consequenceText.trim()
        ? [
            {
              id: makeId("csq"),
              summary: activeDraft.consequenceText.trim(),
              inGameDate: nextDate,
              turnNumber: nextTurnNumber,
              certainty: "KNOWN" as const,
              sourceId: "MANUAL_GM_ENTRY",
            },
            ...ws.consequences,
          ]
        : ws.consequences;

      const nextWorld: WorldState = {
        ...ws,
        stateVersion: nextWorldVersion,
        updatedAt: now,
        currentInGameDate: nextDate,
        elapsedMinutes: ws.elapsedMinutes + activeDraft.timeDeltaMinutes,
        currentLocationId: nextLocationId,
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
            nextInventory.push({ id: makeId("item"), name: change.name, quantity: change.quantity, notes: change.notes, certainty: change.certainty, location: "CARRIED", unitWeightLb: null });
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
          else nextInventory.push({ id: makeId("item"), name: change.name, quantity: change.quantity, notes: change.notes, certainty: change.certainty, location: "CARRIED", unitWeightLb: null });
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
        ...(pc.currency || Object.values(characterChanges.currencyDelta).some((delta) => delta !== 0) ? { currency: nextCurrency } : {}),
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
        campaignMemory: activeDraft.campaignMemory?.trim() ?? "",
        characterChanges,
        npcChanges: activeDraft.npcChanges ?? [],
        locationIdAfter: nextLocationId,
        hpDelta: activeDraft.hpDelta,
        rolls: activeDraft.rolls,
        affectedCampaignVersion: nextWorldVersion,
        affectedCharacterVersion: nextCharacterVersion,
      };

      const turnEntry: GameTurnEntry = {
        ...baseTurnPayload,
        entryChecksum: computeChecksum(baseTurnPayload),
      };

      const nextSessionLog: SessionLogState = {
        ...collections.session_log,
        lastTurnNumber: nextTurnNumber,
        entries: [...collections.session_log.entries, turnEntry],
      };

      const nextAudit = appendAudit(
        collections.audit_log,
        "TURN_COMMITTED",
        "OK",
        `Зафиксирован ход №${nextTurnNumber}: ${turnEntry.summary} (+${turnEntry.timeDeltaMinutes} мин).`,
        nextWorld,
        nextCharacter,
        nextTurnNumber,
      );

      return commitCollections(
        {
          ...collections,
          canon_facts: nextFacts,
          world_state: nextWorld,
          player_character_state: nextCharacter,
          npcs: nextNpcs,
          turn_drafts: [createEmptyTurnDraft(makeId("draft"))],
          session_log: nextSessionLog,
          audit_log: nextAudit,
        },
        nextTurnNumber,
      );
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
      verifySource,
      setSourceContextEnabled,
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
      applyGeneratedStart,
      updateCampaignParameters,
      confirmCampaignSetup,
    resetForTrialCampaign,
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
      verifySource,
      setSourceContextEnabled,
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
      applyGeneratedStart,
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