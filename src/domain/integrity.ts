import type {
  BackupEnvelope,
  CollectionName,
  GameTurnEntry,
  IntegrityCheckItem,
  IntegrityReport,
  ObsidianCollections,
  NpcRecord,
  PlayerCharacterState,
  TurnDraft,
  WorldState,
} from "./types";

export interface HitPointDeltaResult {
  hpCurrent: number | null;
  hpTemp: number | null;
  error: string | null;
}

export interface NpcHitPointDamageResult {
  hpCurrent: number | null;
  appliedDamage: number;
  error: string | null;
}

/** Apply D&D damage using only a verified NPC combat profile. */
export function applyNpcHitPointDamage(
  hpCurrent: number | null,
  hpMax: number | null,
  damage: number,
  damageType: string | null,
  resistances: string[],
  vulnerabilities: string[],
  immunities: string[],
): NpcHitPointDamageResult {
  if (!Number.isInteger(damage) || damage < 0 || damage > 10000) {
    return { hpCurrent, appliedDamage: 0, error: "Урон NPC должен быть подтверждённым неотрицательным целым числом." };
  }
  if (!Number.isInteger(hpCurrent) || hpCurrent === null || hpCurrent < 0 ||
      !Number.isInteger(hpMax) || hpMax === null || hpMax < 1 || hpCurrent > hpMax) {
    return { hpCurrent, appliedDamage: 0, error: "Нельзя применить урон: текущие и максимальные HP NPC не подтверждены." };
  }
  const defenseLists = [resistances, vulnerabilities, immunities];
  if (defenseLists.some((list) => !Array.isArray(list) || list.some((item) => typeof item !== "string"))) {
    return { hpCurrent, appliedDamage: 0, error: "Защиты NPC имеют некорректный формат." };
  }
  const normalizedType = damageType?.trim().toLocaleLowerCase() ?? "";
  const hasDefenses = defenseLists.some((list) => list.length > 0);
  if (!normalizedType && hasDefenses) {
    return { hpCurrent, appliedDamage: 0, error: "Тип урона неизвестен, поэтому нельзя безопасно применить сопротивления/уязвимости NPC." };
  }
  const matches = (list: string[]) => Boolean(normalizedType) &&
    list.some((item) => item.trim().toLocaleLowerCase() === normalizedType);
  let appliedDamage = damage;
  const resistant = matches(resistances);
  const vulnerable = matches(vulnerabilities);
  if (matches(immunities)) appliedDamage = 0;
  else if (resistant && !vulnerable) appliedDamage = Math.floor(damage / 2);
  else if (vulnerable && !resistant) appliedDamage = damage * 2;
  return { hpCurrent: Math.max(0, hpCurrent - appliedDamage), appliedDamage, error: null };
}

/**
 * Applies signed HP changes using D&D 2024 hit-point rules:
 * damage consumes temporary HP first; healing never restores temporary HP
 * and cannot raise current HP above its maximum.
 */
export function applyHitPointDelta(
  hpCurrent: number | null,
  hpMax: number | null,
  hpTemp: number | null,
  delta: number,
): HitPointDeltaResult {
  if (!Number.isInteger(delta)) return { hpCurrent, hpTemp, error: "Изменение HP должно быть целым числом." };
  if (delta === 0) return { hpCurrent, hpTemp, error: null };
  if (hpCurrent === null) return { hpCurrent, hpTemp, error: "Нельзя изменить HP: текущее значение UNKNOWN. Уточните текущие HP в листе персонажа." };
  if (hpMax !== null && (!Number.isInteger(hpMax) || hpMax < 0)) return { hpCurrent, hpTemp, error: "Максимум HP не подтверждён." };
  const temporary = Math.max(0, hpTemp ?? 0);
  if (delta < 0) {
    const damage = -delta;
    const absorbed = Math.min(temporary, damage);
    const remainingDamage = damage - absorbed;
    const nextCurrent = hpCurrent - remainingDamage;
    if (nextCurrent < 0) return { hpCurrent, hpTemp, error: "Итоговые HP персонажа не могут быть меньше 0 (проверьте дельту HP)." };
    return { hpCurrent: nextCurrent, hpTemp: hpTemp === null ? null : temporary - absorbed, error: null };
  }
  const healed = hpMax === null ? hpCurrent + delta : Math.min(hpMax, hpCurrent + delta);
  return { hpCurrent: healed, hpTemp, error: null };
}

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
  collectionsNpcs: NpcRecord[] = [],
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
  const hpChange = applyHitPointDelta(character.hpCurrent, character.hpMax, character.hpTemp, draft.hpDelta);
  if (hpChange.error) errors.push(hpChange.error);
  for (const change of draft.npcChanges ?? []) {
    const existing = collectionsNpcs.find((npc) => npc.name.toLocaleLowerCase() === change.name.toLocaleLowerCase());
    if (change.action === "CREATE" && existing) errors.push(`NPC «${change.name}» уже существует; нельзя создать дубликат.`);
    if (change.action === "UPDATE" && !existing) errors.push(`Нельзя обновить NPC «${change.name}»: он отсутствует в реестре.`);
    if (change.action === "UPDATE" && existing?.locked) errors.push(`NPC «${change.name}» заблокирован; сначала разблокируйте карточку вручную.`);
    if (existing?.gmProfile?.combatProfile.status === "SRD_VERIFIED" &&
        change.gmProfile?.combatProfile &&
        JSON.stringify(change.gmProfile.combatProfile) !== JSON.stringify(existing.gmProfile.combatProfile)) {
      errors.push(`Подтверждённый боевой профиль NPC «${change.name}» нельзя переписывать ответом мастера. HP и параметры боя меняются только через проверенные боевые события.`);
    }
    if (!change.name.trim() || !change.role.trim() || !change.goals.trim() || !change.reason.trim()) errors.push("Изменение NPC требует имени, роли, целей и причины.");
    if (change.gmProfile) {
      const profile = change.gmProfile;
      if ([profile.biography, profile.appearance, profile.personality, profile.motivation, profile.longTermGoal,
        profile.secrets, profile.relationships, profile.skillsAndAbilities].some((value) => typeof value !== "string")) {
        errors.push(`Скрытая карточка NPC «${change.name}» содержит некорректные поля.`);
      }
      const combat = profile.combatProfile;
      if (!combat || !["NOT_REQUIRED", "SRD_VERIFIED", "UNKNOWN"].includes(combat.status) ||
          (combat.armorClass !== null && (!Number.isInteger(combat.armorClass) || combat.armorClass < 1 || combat.armorClass > 40)) ||
          (combat.hitPointsCurrent !== null && (!Number.isInteger(combat.hitPointsCurrent) || combat.hitPointsCurrent < 0 || combat.hitPointsCurrent > 5000)) ||
          (combat.hitPointsMax !== null && (!Number.isInteger(combat.hitPointsMax) || combat.hitPointsMax < 1 || combat.hitPointsMax > 5000)) ||
          (combat.hitPointsCurrent !== null && combat.hitPointsMax !== null && combat.hitPointsCurrent > combat.hitPointsMax) ||
          (combat.status === "SRD_VERIFIED" && (!combat.source.trim() || combat.armorClass === null || combat.hitPointsCurrent === null || combat.hitPointsMax === null))) {
        errors.push(`Боевой профиль NPC «${change.name}» не прошёл проверку источника и числовых значений.`);
      }
    }
    for (const knowledge of change.knowledgeAdditions) {
      if (!knowledge.factSummary.trim() || !knowledge.acquisitionPath.trim()) errors.push(`Знание NPC «${change.name}» должно иметь содержание и канал получения.`);
    }
    for (const knowledge of change.playerKnowledgeAdditions) {
      if (!knowledge.factSummary.trim() || !knowledge.acquisitionPath.trim()) errors.push(`Знание персонажа о NPC «${change.name}» должно иметь содержание и канал получения.`);
    }
  }
  for (const event of draft.combatEvents ?? []) {
    if (!["PLAYER", "NPC"].includes(event.targetType) ||
        typeof event.targetName !== "string" || !event.targetName.trim() ||
        !Number.isInteger(event.damage) || event.damage < 0 || event.damage > 10000 ||
        !(event.damageType === null || typeof event.damageType === "string") ||
        typeof event.critical !== "boolean" ||
        !["PLAYER", "NPC"].includes(event.source) ||
        typeof event.formula !== "string" || !event.formula.trim() ||
        typeof event.rollLabel !== "string" || !event.rollLabel.trim()) {
      errors.push("Подтверждённое боевое событие имеет некорректные поля.");
      continue;
    }
    if (event.targetType === "NPC") {
      const existing = collectionsNpcs.find((npc) =>
        npc.name.normalize("NFKC").trim().toLocaleLowerCase() === event.targetName.normalize("NFKC").trim().toLocaleLowerCase()
      );
      const profile = existing?.gmProfile;
      const combat = profile?.combatProfile;
      if (!combat || combat.status !== "SRD_VERIFIED") {
        errors.push(`Нельзя применить урон к NPC «${event.targetName}»: отсутствует подтверждённый боевой профиль SRD.`);
        continue;
      }
      const applied = applyNpcHitPointDamage(
        combat.hitPointsCurrent, combat.hitPointsMax, event.damage, event.damageType,
        combat.resistances, combat.vulnerabilities, combat.immunities,
      );
      if (applied.error) errors.push(`NPC «${event.targetName}»: ${applied.error}`);
    }
  }
  const playerDamage = (draft.combatEvents ?? [])
    .filter((event) => event.targetType === "PLAYER")
    .reduce((sum, event) => sum + event.damage, 0);
  if (playerDamage > 0 && draft.hpDelta !== -playerDamage) {
    errors.push("Изменение HP героя не совпадает с подтверждёнными результатами урона NPC.");
  }
  const existingQuests = worldState.quests ?? [];
  for (const change of draft.questChanges ?? []) {
    const existing = existingQuests.find((quest) => quest.title.toLocaleLowerCase() === change.title.toLocaleLowerCase());
    if (change.action === "CREATE" && existing) errors.push(`Задание «${change.title}» уже существует; используйте UPDATE.`);
    if (change.action === "UPDATE" && !existing) errors.push(`Нельзя обновить неизвестное персонажу задание «${change.title}».`);
    if (!change.title.trim() || !change.sourcePath.trim() || !change.description.trim()) errors.push("Запись задания должна иметь название, описание и источник получения информации.");
  }
  if (draft.environment) {
    if (!draft.environment.weather.trim() || !draft.environment.lighting.trim() || !draft.environment.visibility.trim() || !draft.environment.temperatureCertainty) errors.push("Блок окружения должен содержать явные значения или UNKNOWN.");
    if (draft.environment.temperatureC !== null && (!Number.isFinite(draft.environment.temperatureC) || draft.environment.temperatureC < -90 || draft.environment.temperatureC > 65)) errors.push("Температура вне допустимого физического диапазона; проверьте источник.");
  }
  const changes = draft.characterChanges;
  if (changes) {
    for (const change of changes.inventory) {
      if (!change.name.trim() || !Number.isInteger(change.quantity) ||
          (change.action === "SET" ? change.quantity < 0 : change.quantity < 1)) {
        errors.push("Некорректное изменение инвентаря: проверьте название и количество.");
        break;
      }
      if (change.action === "REMOVE") {
        const existing = character.inventory.find((item) => item.name.toLocaleLowerCase() === change.name.toLocaleLowerCase());
        if (!existing || existing.quantity < change.quantity) {
          errors.push(`Нельзя списать ${change.quantity} ед. «${change.name}»: в инвентаре недостаточное количество.`);
          break;
        }
      }
    }
    for (const resource of changes.resources) {
      const existingResource = character.resources.find((item) => item.name.toLocaleLowerCase() === resource.name.toLocaleLowerCase());
      if (existingResource?.current === null && resource.current !== null) {
        errors.push(`Нельзя подставить текущее значение ресурса «${resource.name}»: оно UNKNOWN. Сначала игрок должен указать фактический остаток.`);
        break;
      }
      if (existingResource?.max !== null && existingResource?.max !== undefined && resource.max !== null && resource.max !== existingResource.max) {
        errors.push(`Нельзя менять максимум ресурса «${resource.name}» без подтверждённого изменения листа персонажа.`);
        break;
      }
      if (!resource.name.trim() || (resource.current !== null && (!Number.isInteger(resource.current) || resource.current < 0)) ||
          (resource.max !== null && (!Number.isInteger(resource.max) || resource.max < 0)) ||
          (resource.current !== null && resource.max !== null && resource.current > resource.max)) {
        errors.push(`Некорректное значение ресурса «${resource.name}».`);
        break;
      }
    }
    const hasCurrencyDelta = Object.values(changes.currencyDelta).some((delta) => delta !== 0);
    if (hasCurrencyDelta && !character.currency) errors.push("Баланс монет UNKNOWN. Внесите все номиналы в лист персонажа перед изменением денег.");
    const currency = character.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    for (const coin of ["cp", "sp", "ep", "gp", "pp"] as const) {
      const delta = changes.currencyDelta[coin];
      if (!Number.isInteger(delta) || currency[coin] + delta < 0) {
        errors.push(`Изменение валюты ${coin.toUpperCase()} приводит к отрицательному остатку.`);
        break;
      }
    }
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
    [...npc.knowledge, ...(npc.playerKnowledge ?? [])]
      .filter((k) => !k.acquisitionPath.trim() || !k.sourceId.trim())
      .map((k) => `${npc.name}: ${k.factSummary}`),
  );
  const provenanceOk = factsWithoutSource.length === 0 && npcKnowledgeMissingPath.length === 0;
  checks.push({
    id: "provenance",
    label: "Происхождение фактов и путей знания NPC",
    passed: provenanceOk,
    details: provenanceOk
      ? `Проверено фактов: ${canon_facts.length}, записей знаний NPC и игрока: ${npcs.reduce((acc, n) => acc + n.knowledge.length + (n.playerKnowledge?.length ?? 0), 0)}.`
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

  // 6. AI context may only contain attached, processed and explicitly reviewed sources.
  const unsafeContextSources = sources.filter((source) =>
    source.contextEnabled === true && (
      source.contentStatus !== "ATTACHED" ||
      source.processing?.status !== "PROCESSED" ||
      source.reviewStatus !== "VERIFIED"
    ),
  );
  checks.push({
    id: "source-context-review",
    label: "Проверка источников, включённых в контекст ИИ",
    passed: unsafeContextSources.length === 0,
    details: unsafeContextSources.length === 0
      ? "Все источники контекста загружены, обработаны и подтверждены пользователем."
      : `Непроверенных источников в контексте: ${unsafeContextSources.map((source) => source.title).join(", ")}.`,
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