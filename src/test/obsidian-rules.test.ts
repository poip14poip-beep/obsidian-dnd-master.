import { describe, expect, it } from "vitest";

import { createEmptyTurnDraft, createInitialCollections } from "@/domain/defaults";
import {
  COLLECTION_NAMES,
  buildBackupEnvelope,
  detectNestedPlayerState,
  runIntegrityAudit,
  validateBackupEnvelope,
  validateTurnDraft,
} from "@/domain/integrity";
import { STORAGE_KEYS, persistAndVerifyCollections, type StorageLike } from "@/domain/storage";

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("Obsidian Control core simulation invariants", () => {
  it("starts with empty/UNKNOWN non-fabricated state and 11 separate storage keys", () => {
    const initial = createInitialCollections();

    expect(COLLECTION_NAMES).toHaveLength(11);
    expect(Object.keys(STORAGE_KEYS).sort()).toEqual([...COLLECTION_NAMES].sort());
    expect(new Set(Object.values(STORAGE_KEYS)).size).toBe(11);

    expect(initial.world_state.campaignName).toBe("");
    expect(initial.world_state.startInGameDate).toBe("UNKNOWN");
    expect(initial.world_state.currentInGameDate).toBe("UNKNOWN");
    expect(initial.world_state.startLocationName).toBe("UNKNOWN");
    expect(initial.world_state.setup.confirmed).toBe(false);
    expect(initial.player_character_state.name).toBe("UNKNOWN");
    expect(initial.player_character_state.statsCertainty).toBe("UNKNOWN");
    expect(initial.session_log.lastTurnNumber).toBe(0);
    expect(initial.canon_facts).toHaveLength(0);
    expect(initial.npcs).toHaveLength(0);
    expect(initial.factions).toHaveLength(0);
    expect(initial.locations).toHaveLength(0);
    expect(initial.timeline_events).toHaveLength(0);
  });

  it("forbids nesting player_character_state inside world_state in writes, audits, and backups", () => {
    const collections = createInitialCollections();
    const storage = createMemoryStorage();

    expect(detectNestedPlayerState(collections.world_state, "world_state")).toBeNull();
    expect(runIntegrityAudit(collections).ok).toBe(true);

    const corrupted = {
      ...collections,
      world_state: {
        ...collections.world_state,
        player_character_state: collections.player_character_state,
      },
    };
    expect(detectNestedPlayerState(corrupted.world_state, "world_state")).toBe(
      "world_state.player_character_state",
    );
    const report = runIntegrityAudit(corrupted as typeof collections);
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "partition-isolation")?.passed).toBe(false);

    const writeResult = persistAndVerifyCollections(storage, corrupted as typeof collections);
    expect(writeResult.ok).toBe(false);
  });

  it("blocks turn validation until campaign setup wizard is explicitly confirmed", () => {
    const collections = createInitialCollections();
    collections.sources[0]!.content = "Rules text";
    collections.sources[0]!.contentStatus = "ATTACHED";
    const draft = {
      ...createEmptyTurnDraft(),
      summary: "Выход на площадь",
      worldOutcome: "Площадь пуста",
    };

    const errors = validateTurnDraft(
      draft,
      collections.world_state,
      collections.player_character_state,
    );
    expect(errors.some((e) => e.includes("заблокирована"))).toBe(true);

    collections.world_state.setup.confirmed = true;
    expect(
      validateTurnDraft(draft, collections.world_state, collections.player_character_state),
    ).toEqual([]);
  });

  it("detects broken append-only turn sequence and ignores technical messages in numbering", () => {
    const collections = createInitialCollections();
    collections.world_state.setup.confirmed = true;
    collections.session_log.entries.push({
      id: "tech-1",
      entryType: "TECHNICAL_NOTE",
      recordedAt: new Date().toISOString(),
      inGameDateSnapshot: "UNKNOWN",
      text: "Уточнение правила",
      advancesTime: false,
    });
    expect(runIntegrityAudit(collections).ok).toBe(true);

    collections.session_log.entries.push({
      id: "turn-gap",
      entryType: "GAME_TURN",
      turnNumber: 2,
      committedAt: new Date().toISOString(),
      inGameDateBefore: "День 1",
      inGameDateAfter: "День 1",
      timeDeltaMinutes: 10,
      summary: "Пропущенный ход",
      playerIntent: "",
      worldOutcome: "Исход",
      locationIdAfter: null,
      hpDelta: 0,
      rolls: [],
      affectedCampaignVersion: 2,
      affectedCharacterVersion: 2,
      entryChecksum: "abc",
    });
    collections.session_log.lastTurnNumber = 2;
    const bad = runIntegrityAudit(collections);
    expect(bad.ok).toBe(false);
    expect(bad.checks.find((c) => c.id === "turn-sequence")?.passed).toBe(false);
  });

  it("enforces provenance on canon_facts and acquisition paths on NPC knowledge", () => {
    const collections = createInitialCollections();
    collections.npcs.push({
      id: "npc-1",
      name: "Стражник",
      role: "Дозорный",
      locationId: null,
      factionId: null,
      goals: "UNKNOWN",
      attitudeToPlayer: "UNKNOWN",
      certainty: "APPROXIMATE",
      sourceId: "MANUAL_GM_ENTRY",
      locked: true,
      version: 1,
      history: [],
      knowledge: [
        {
          id: "k-1",
          factSummary: "Секретный факт",
          sourceId: "MANUAL_GM_ENTRY",
          acquisitionPath: "",
          inGameDate: "UNKNOWN",
          certainty: "KNOWN",
          recordedAt: new Date().toISOString(),
        },
      ],
    });
    const report = runIntegrityAudit(collections);
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "provenance")?.passed).toBe(false);
  });

  it("compares exact persisted payload on read-back across all 11 collections and fails on mismatch", () => {
    const storage = createMemoryStorage();
    const collections = createInitialCollections();

    const okResult = persistAndVerifyCollections(storage, collections);
    expect(okResult.ok).toBe(true);
    for (const name of COLLECTION_NAMES) {
      expect(storage.getItem(STORAGE_KEYS[name])).toBeTruthy();
    }

    // Corrupted storage mutating world_state on read-back
    const tamperedStorage: StorageLike = {
      ...storage,
      getItem: (k) => {
        if (k === STORAGE_KEYS.world_state) {
          return JSON.stringify({ ...collections.world_state, campaignName: "TAMPERED" });
        }
        return storage.getItem(k);
      },
    };
    const failResult = persistAndVerifyCollections(tamperedStorage, collections);
    expect(failResult.ok).toBe(false);
    if (!failResult.ok) {
      expect(failResult.error).toContain("Несовпадение payload");
    }
  });

  it("validates JSON backup envelope for all 11 collections and rejects tampering or missing keys", () => {
    const collections = createInitialCollections();
    const backup = buildBackupEnvelope(collections);
    expect(validateBackupEnvelope(backup).ok).toBe(true);

    const tampered = {
      ...backup,
      collections: {
        ...backup.collections,
        world_state: { ...collections.world_state, campaignName: "Подмена" },
      },
    };
    expect(validateBackupEnvelope(tampered).ok).toBe(false);

    const { npcs: _dropped, ...incompleteCollections } = backup.collections;
    const missingKey = {
      ...backup,
      collections: incompleteCollections,
    };
    expect(validateBackupEnvelope(missingKey).ok).toBe(false);
  });
});