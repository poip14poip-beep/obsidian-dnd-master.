import { createInitialCollections } from "./defaults";
import {
  COLLECTION_NAMES,
  canonicalStringify,
  computeCollectionChecksums,
  detectNestedPlayerState,
  runIntegrityAudit,
} from "./integrity";
import type { CollectionName, IntegrityReport, ObsidianCollections } from "./types";

/**
 * 11 physically separate localStorage keys matching the exact domain collections.
 * player_character_state is never stored inside world_state.
 */
export const STORAGE_KEYS: Record<CollectionName, string> = {
  sources: "obsidian_control::sources_v2",
  canon_facts: "obsidian_control::canon_facts_v2",
  world_state: "obsidian_control::world_state_v2",
  player_character_state: "obsidian_control::player_character_state_v2",
  npcs: "obsidian_control::npcs_v2",
  factions: "obsidian_control::factions_v2",
  locations: "obsidian_control::locations_v2",
  timeline_events: "obsidian_control::timeline_events_v2",
  turn_drafts: "obsidian_control::turn_drafts_v2",
  session_log: "obsidian_control::session_log_v2",
  audit_log: "obsidian_control::audit_log_v2",
} as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type PersistVerifyResult =
  | { ok: true; report: IntegrityReport }
  | { ok: false; error: string; report: IntegrityReport | null };

export function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeParse<T>(raw: string | null, fallback: () => T): T {
  if (!raw) return fallback();
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback();
  }
}

export function loadAllCollections(storage: StorageLike | null): ObsidianCollections {
  const defaults = createInitialCollections();
  if (!storage) {
    return defaults;
  }
  return {
    sources: safeParse(storage.getItem(STORAGE_KEYS.sources), () => defaults.sources),
    canon_facts: safeParse(storage.getItem(STORAGE_KEYS.canon_facts), () => defaults.canon_facts),
    world_state: safeParse(storage.getItem(STORAGE_KEYS.world_state), () => defaults.world_state),
    player_character_state: safeParse(
      storage.getItem(STORAGE_KEYS.player_character_state),
      () => defaults.player_character_state,
    ),
    npcs: safeParse(storage.getItem(STORAGE_KEYS.npcs), () => defaults.npcs),
    factions: safeParse(storage.getItem(STORAGE_KEYS.factions), () => defaults.factions),
    locations: safeParse(storage.getItem(STORAGE_KEYS.locations), () => defaults.locations),
    timeline_events: safeParse(
      storage.getItem(STORAGE_KEYS.timeline_events),
      () => defaults.timeline_events,
    ),
    turn_drafts: safeParse(storage.getItem(STORAGE_KEYS.turn_drafts), () => defaults.turn_drafts),
    session_log: safeParse(storage.getItem(STORAGE_KEYS.session_log), () => defaults.session_log),
    audit_log: safeParse(storage.getItem(STORAGE_KEYS.audit_log), () => defaults.audit_log),
  };
}

/**
 * Writes all 11 separate collections and IMMEDIATELY reads every key back to compare:
 * - Exact canonical payload equality (written payload === read-back payload)
 * - Checksums match across all 11 collections
 * - player_character_state is not nested inside world_state
 * - Full integrity audit passes
 * If ANY check or payload comparison fails, returns { ok: false, error } and NEVER claims success.
 */
export function persistAndVerifyCollections(
  storage: StorageLike | null,
  collections: ObsidianCollections,
  expectedTailTurnNumber?: number,
): PersistVerifyResult {
  if (!storage) {
    return {
      ok: false,
      error: "Локальное хранилище браузера недоступно — сохранение не подтверждено.",
      report: null,
    };
  }

  const nestedBeforeWrite = detectNestedPlayerState(collections.world_state, "world_state");
  if (nestedBeforeWrite) {
    return {
      ok: false,
      error: `Запись отклонена: player_character_state обнаружен внутри world_state (${nestedBeforeWrite}).`,
      report: null,
    };
  }

  const expectedCanonical: Record<CollectionName, string> = {} as Record<CollectionName, string>;
  const expectedChecksums = computeCollectionChecksums(collections);
  for (const name of COLLECTION_NAMES) {
    expectedCanonical[name] = canonicalStringify(collections[name]);
  }

  try {
    for (const name of COLLECTION_NAMES) {
      storage.setItem(STORAGE_KEYS[name], JSON.stringify(collections[name]));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "неизвестная ошибка записи";
    return {
      ok: false,
      error: `Ошибка записи в localStorage: ${msg}. Сохранение НЕ выполнено.`,
      report: null,
    };
  }

  // Mandatory read-back + exact payload comparison across all 11 collections
  try {
    const readBack = {} as Record<CollectionName, unknown>;
    for (const name of COLLECTION_NAMES) {
      const raw = storage.getItem(STORAGE_KEYS[name]);
      if (raw === null) {
        return {
          ok: false,
          error: `Проверка обратного чтения не удалась: коллекция «${name}» отсутствует в хранилище.`,
          report: null,
        };
      }
      const parsed: unknown = JSON.parse(raw);
      const readCanonical = canonicalStringify(parsed);
      if (readCanonical !== expectedCanonical[name]) {
        return {
          ok: false,
          error: `Несовпадение payload при обратном чтении коллекции «${name}»: сохранённые данные отличаются от записываемых.`,
          report: null,
        };
      }
      readBack[name] = parsed;
    }

    const readCollections = readBack as unknown as ObsidianCollections;
    const report = runIntegrityAudit(readCollections);

    for (const name of COLLECTION_NAMES) {
      if (report.checksums[name] !== expectedChecksums[name]) {
        return {
          ok: false,
          error: `Контрольная сумма коллекции «${name}» не совпала после обратного чтения.`,
          report,
        };
      }
    }

    if (
      expectedTailTurnNumber !== undefined &&
      readCollections.session_log.lastTurnNumber !== expectedTailTurnNumber
    ) {
      return {
        ok: false,
        error: `Обратное чтение session_log не подтвердило ход №${expectedTailTurnNumber}.`,
        report,
      };
    }

    if (!report.ok) {
      const failed = report.checks
        .filter((c) => !c.passed)
        .map((c) => c.label)
        .join("; ");
      return {
        ok: false,
        error: `Проверка целостности после записи выявила нарушения: ${failed}.`,
        report,
      };
    }

    return { ok: true, report };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ошибка разбора JSON";
    return {
      ok: false,
      error: `Обратное чтение повреждено (${msg}). Сохранение не подтверждено.`,
      report: null,
    };
  }
}