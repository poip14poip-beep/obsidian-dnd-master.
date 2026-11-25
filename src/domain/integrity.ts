import type {
  BackupEnvelope,
  CollectionName,
  GameTurnEntry,
  IntegrityCheckItem,
  IntegrityReport,
  ObsidianCollections,
  PlayerCharacterState,
  TurnDraft,
  WorldState,
} from "./types";

export const COLLECTION_NAMES: ReadonlyArray<CollectionName> = [
  "sources",
  "canon_facts",
  "world_state",
  "player_character_state",
  "npcs",
  "factions",
  "locations",
  "timeline_events",
  "turn_drafts",
  "session_log",
  "audit_log",
];

/**
 * Deterministic canonical serialization for checksum verification.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(",")}}`;
}

/**
 * Synchronous 64-bit dual FNV-1a hex digest for client-side integrity read-back checks.
 */
export function computeChecksum(input: unknown): string {
  const str = typeof input === "string" ? input : canonicalStringify(input);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const p2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${p1}${p2}`;
}

const FORBIDDEN_PC_KEYS = new Set([
  "playerCharacter",
  "playerCharacterState",
  "PLAYER_CHARACTER_STATE",
  "player_character_state",
  "characterSheet",
  "pcState",
]);

export function detectNestedPlayerState(obj: unknown, path = "world_state"): string | null {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const found = detectNestedPlayerState(obj[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (FORBIDDEN_PC_KEYS.has(key)) {
      return `${path}.${key}`;
    }
    const nested = detectNestedPlayerState(val, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

export function computeCollectionChecksums(
  collections: ObsidianCollections,
): Record<CollectionName, string> {
  return {
    sources: computeChecksum(collections.sources),
    canon_facts: computeChecksum(collections.canon_facts),
    world_state: computeChecksum(collections.world_state),
    player_character_state: computeChecksum(collections.player_character_state),
    npcs: computeChecksum(collections.npcs),
    factions: computeChecksum(collections.factions),
    locations: computeChecksum(collections.locations),
    timeline_events: computeChecksum(collections.timeline_events),
    turn_drafts: computeChecksum(collections.turn_drafts),
    session_log: computeChecksum(collections.session_log),
    audit_log: computeChecksum(collections.audit_log),
  };
}

export function validateTurnDraft(
  draft: TurnDraft,
  worldState: WorldState,
  character: PlayerCharacterState,
): string[] {
  const errors: string[] = [];
  if (!worldState.setup.confirmed) {
    errors.push("Игра заблокирована: завершите Мастер подготовки кампании в Настройках.");
  }
  if (!draft.summary.trim()) {
    errors.push("Укажите краткое содержание хода.");
  }
  if (!draft.worldOutcome.trim()) {
    errors.push("Укажите зафиксированный результат/исход в мире.");
  }
  if (!Number.isFinite(draft.timeDeltaMinutes) || draft.timeDeltaMinutes < 0) {
    errors.push("Изменение игрового времени не может быть отрицательным.");
  }
  if (
    draft.hpDelta !== 0 &&
    character.hpCurrent !== null &&
    character.hpCurrent + draft.hpDelta < 0
  ) {
    errors.push("Итоговые HP персонажа не могут быть меньше 0 (проверьте дельту HP).");
  }
  if (draft.newFactTitle.trim() && !draft.newFactStatement.trim()) {
    errors.push("Для нового факта заполните формулировку утверждения.");
  }
  if (draft.newFactStatement.trim() && !draft.newFactTitle.trim()) {
    errors.push("Для нового факта укажите заголовок.");
  }
  if (draft.newFactStatement.trim() && !draft.newFactSourceId.trim()) {
    errors.push("Для нового факта обязательно укажите источник происхождения.");
  }
  for (const roll of draft.rolls) {
    if (!roll.label.trim() || !roll.result.trim()) {
      errors.push("У каждого броска должны быть заполнены название и результат.");
      break;
    }
  }
  return errors;
}

export function runIntegrityAudit(collections: ObsidianCollections): IntegrityReport {
  const { sources, canon_facts, world_state, npcs, session_log } = collections;
  const checks: IntegrityCheckItem[] = [];

  // 1. Strict separation of player_character_state from world_state
  const nestedPath = detectNestedPlayerState(world_state, "world_state");
  checks.push({
    id: "partition-isolation",
    label: "Изоляция player_character_state от world_state",
    passed: nestedPath === null,
    details:
      nestedPath === null
        ? "Контуры разделены: player_character_state хранится отдельно от world_state."
        : `Обнаружено недопустимое вложение player_character_state внутри world_state: ${nestedPath}`,
  });

  // 2. Append-only sequential game turns & technical note isolation
  const gameTurns = session_log.entries.filter(
    (entry): entry is GameTurnEntry => entry.entryType === "GAME_TURN",
  );
  let sequenceOk = true;
  let sequenceDetails = `Проверено игровых ходов: ${gameTurns.length}. Нумерация последовательна.`;
  const seenNumbers = new Set<number>();
  for (let i = 0; i < gameTurns.length; i++) {
    const turn = gameTurns[i];
    if (!turn) continue;
    const expected = i + 1;
    if (turn.turnNumber !== expected || seenNumbers.has(turn.turnNumber)) {
      sequenceOk = false;
      sequenceDetails = `Нарушена последовательность ходов: ожидался №${expected}, найден №${turn.turnNumber}.`;
      break;
    }
    seenNumbers.add(turn.turnNumber);
  }
  if (sequenceOk && session_log.lastTurnNumber !== gameTurns.length) {
    sequenceOk = false;
    sequenceDetails = `Счётчик lastTurnNumber (${session_log.lastTurnNumber}) не совпадает с числом ходов (${gameTurns.length}).`;
  }
  checks.push({
    id: "turn-sequence",
    label: "Последовательность append-only session_log",
    passed: sequenceOk,
    details: sequenceDetails,
  });

  // 3. Setup gate enforcement
  const setupGateOk = world_state.setup.confirmed || gameTurns.length === 0;
  checks.push({
    id: "setup-gate",
    label: "Блокировка игры до подтверждения мастера настройки",
    passed: setupGateOk,
    details: setupGateOk
      ? world_state.setup.confirmed
        ? `Подготовка подтверждена (${world_state.setup.confirmedAt ?? "дата не указана"}).`
        : "Подготовка не завершена; игровых ходов 0 (блокировка соблюдена)."
      : "Найдены игровые ходы при неподтверждённой подготовке кампании.",
  });

  // 4. Fact & NPC knowledge provenance
  const sourceIds = new Set(sources.map((s) => s.id));
  const factsWithoutSource = canon_facts.filter(
    (f) => !f.sourceId || (!sourceIds.has(f.sourceId) && f.sourceId !== "MANUAL_GM_ENTRY"),
  );
  const npcKnowledgeMissingPath = npcs.flatMap((npc) =>
    npc.knowledge
      .filter((k) => !k.acquisitionPath.trim() || !k.sourceId.trim())
      .map((k) => `${npc.name}: ${k.factSummary}`),
  );
  const provenanceOk = factsWithoutSource.length === 0 && npcKnowledgeMissingPath.length === 0;
  checks.push({
    id: "provenance",
    label: "Происхождение фактов и путей знания NPC",
    passed: provenanceOk,
    details: provenanceOk
      ? `Проверено фактов: ${canon_facts.length}, записей знаний NPC: ${npcs.reduce((acc, n) => acc + n.knowledge.length, 0)}.`
      : `Фактов без источника: ${factsWithoutSource.length}; знаний NPC без пути получения: ${npcKnowledgeMissingPath.length}.`,
  });

  // 5. Sources separation check (3 distinct roles)
  const hasGoverning = sources.some((s) => s.type === "GOVERNING_DOC");
  const hasCanon = sources.some((s) => s.type === "WORLD_CANON");
  const hasDossier = sources.some((s) => s.type === "PLAYER_DOSSIER");
  const sourcesOk = hasGoverning && hasCanon && hasDossier;
  checks.push({
    id: "source-types",
    label: "Раздельные типы источников (ОБСИДИАН 4.1 / Хроника / Досье)",
    passed: sourcesOk,
    details: sourcesOk
      ? "Все три типа источников зарегистрированы раздельно."
      : "Отсутствует один из обязательных типов источников.",
  });

  return {
    checkedAt: new Date().toISOString(),
    ok: checks.every((c) => c.passed),
    checks,
    checksums: computeCollectionChecksums(collections),
  };
}

export function buildBackupEnvelope(collections: ObsidianCollections): BackupEnvelope {
  return {
    app: "Obsidian Control",
    backupVersion: 2,
    exportedAt: new Date().toISOString(),
    storageDisclaimer:
      "Локальная резервная копия браузера (localStorage, 11 отдельных коллекций). Облачное сохранение и серверные ACID-транзакции не подключены.",
    collections,
    checksums: computeCollectionChecksums(collections),
  };
}

export function validateBackupEnvelope(
  raw: unknown,
): { ok: true; envelope: BackupEnvelope } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Файл резервной копии не является JSON-объектом." };
  }
  const data = raw as Partial<BackupEnvelope>;
  if (data.app !== "Obsidian Control" || data.backupVersion !== 2) {
    return { ok: false, error: "Неподдерживаемый формат или версия резервной копии." };
  }
  if (!data.collections || typeof data.collections !== "object") {
    return { ok: false, error: "Отсутствует блок collections с 11 раздельными коллекциями." };
  }
  for (const name of COLLECTION_NAMES) {
    if (!(name in data.collections) || data.collections[name] === undefined) {
      return { ok: false, error: `В резервной копии отсутствует коллекция «${name}».` };
    }
  }
  const nested = detectNestedPlayerState(data.collections.world_state, "world_state");
  if (nested) {
    return {
      ok: false,
      error: `Резервная копия отклонена: player_character_state вложен в world_state (${nested}).`,
    };
  }
  if (data.checksums) {
    const computed = computeCollectionChecksums(data.collections);
    for (const name of COLLECTION_NAMES) {
      if (computed[name] !== data.checksums[name]) {
        return {
          ok: false,
          error: `Контрольная сумма коллекции «${name}» не совпадает с содержимым (файл повреждён или изменён).`,
        };
      }
    }
  }
  const audit = runIntegrityAudit(data.collections);
  if (!audit.ok) {
    const failed = audit.checks
      .filter((c) => !c.passed)
      .map((c) => c.details)
      .join(" ");
    return { ok: false, error: `Нарушена целостность данных в резервной копии: ${failed}` };
  }
  return { ok: true, envelope: data as BackupEnvelope };
}