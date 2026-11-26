import type { GameMasterTurn } from "./game-master";
import type { LocationRecord, PlayerCharacterState, WorldState } from "./types";

function known(value: string | null | undefined): string {
  return value && value.trim() && value.trim().toUpperCase() !== "UNKNOWN" ? value.trim() : "НЕ УСТАНОВЛЕНО";
}

/** Formats the AI result using the mandatory OBSIDIAN 4.1 turn structure without inventing missing data. */
export function formatGameMasterAnswer(
  turn: GameMasterTurn,
  world: WorldState,
  character: PlayerCharacterState,
  locations: LocationRecord[],
  turnNumber: number,
): string {
  const location = locations.find((item) => item.id === world.currentLocationId);
  const place = known(location?.name ?? character.currentLocationLabel ?? world.startLocationName);
  const region = known(location?.region);
  const date = known(world.currentInGameDate);
  const timeMatch = date.match(/(?:^|\b)([01]\d|2[0-3]):([0-5]\d)(?:\b|$)/);
  const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "НЕ УСТАНОВЛЕНО";
  const yearMatch = date.match(/(?:год|year)\s*[:№]?\s*(\d{1,4})|(?:^|\D)(\d{1,4})\s*(?:год|г\.?|year)\b/i);
  const yearValue = yearMatch ? (yearMatch[1] ?? yearMatch[2]) : null;
  const year = yearValue ? `${yearValue}${/APPROXIMATE|ПРИБЛИЗИТЕЛЬНО/i.test(date) ? " (APPROXIMATE)" : ""}` : "НЕ УСТАНОВЛЕНО";
  const monthMatch = date.match(/\b(январ(?:ь|я)|феврал(?:ь|я)|март(?:а)?|апрел(?:ь|я)|ма(?:й|я)|июн(?:ь|я)|июл(?:ь|я)|август(?:а)?|сентябр(?:ь|я)|октябр(?:ь|я)|ноябр(?:ь|я)|декабр(?:ь|я))\b/i);
  const month = monthMatch?.[1] ?? "НЕ УСТАНОВЛЕНО";
  const day = monthMatch?.index !== undefined
    ? (date.slice(0, monthMatch.index).match(/(?:^|\D)(\d{1,2})\s*$/)?.[1] ?? "НЕ УСТАНОВЛЕНО")
    : "НЕ УСТАНОВЛЕНО";
  const hour = timeMatch ? Number(timeMatch[1]) : null;
  const timeOfDay = hour === null ? "НЕ УСТАНОВЛЕНО" : hour < 5 ? "НОЧЬ" : hour < 12 ? "УТРО" : hour < 17 ? "ДЕНЬ" : hour < 22 ? "ВЕЧЕР" : "НОЧЬ";
  const lines = [
    "════════════════════════════════════",
    `ХОД #${String(turnNumber).padStart(4, "0")} · ПРЕДВАРИТЕЛЬНЫЙ ОТВЕТ МАСТЕРА`,
    "НЕ СОХРАНЕНО — требуется проверка и подтверждение игрока",
    "════════════════════════════════════",
    "",
    "КАМПАНИЯ:",
    known(world.campaignName),
    "ИГРОВАЯ ДАТА:",
    date,
    `ИГРОВОЙ ГОД: ${year}`,
    `МЕСЯЦ: ${month}`,
    `ДЕНЬ: ${day}`,
    "ДЕНЬ НЕДЕЛИ: НЕ УСТАНОВЛЕНО",
    `ВРЕМЯ: ${time}`,
    `ВРЕМЯ СУТОК: ${timeOfDay}`,
    `МЕСТО: ${place}`,
    `РЕГИОН / ГОРОД / РАЙОН: ${region}`,
    `ТОЧНАЯ ЛОКАЦИЯ: ${place}`,
    "ПОГОДА: НЕ УСТАНОВЛЕНО",
    "ОСВЕЩЕНИЕ: НЕ УСТАНОВЛЕНО",
    "",
    "────────────────────────────────────",
    "ПАМЯТЬ КАМПАНИИ",
    "────────────────────────────────────",
    turn.campaignMemory || "Нет дополнительных значимых событий, релевантных этой сцене.",
    "",
    "────────────────────────────────────",
    "СЦЕНА",
    "────────────────────────────────────",
    turn.narration,
    "",
    "────────────────────────────────────",
    "СЕНСОРНОЕ ВОСПРИЯТИЕ",
    "────────────────────────────────────",
    turn.sensoryDescription || "Без новых заметных изменений.",
    "",
    "────────────────────────────────────",
    "ПРОСТРАНСТВО И ПОЗИЦИИ",
    "────────────────────────────────────",
    turn.spatialAccounting || "Точные позиции и расстояния не установлены.",
    "",
    "────────────────────────────────────",
    "RAW / МЕХАНИКА",
    "────────────────────────────────────",
    turn.mechanics || "Дополнительная проверка не требуется; причина должна быть указана мастером.",
    "",
    "────────────────────────────────────",
    "РЕЗУЛЬТАТ И ПОСЛЕДСТВИЯ",
    "────────────────────────────────────",
    `Непосредственный результат: ${turn.worldOutcome}`,
    turn.consequences || "Дополнительные последствия не установлены.",
    `Изменение времени: ${turn.timeDeltaMinutes} мин.`,
    `Новая внутриигровая дата: ${known(turn.newInGameDate)}`,
    `Изменение позиции: ${turn.newLocationId ? (locations.find((item) => item.id === turn.newLocationId)?.name ?? "UNKNOWN — локация не найдена в реестре") : "не заявлено"}`,
    "",
    "────────────────────────────────────",
    "УЧЁТ РЕСУРСОВ",
    "────────────────────────────────────",
    turn.resourceAccounting || "Изменения ресурсов не заявлены.",
    "",
    "────────────────────────────────────",
    "СЛЕДУЮЩЕЕ ДЕЙСТВИЕ",
    "────────────────────────────────────",
    turn.nextAction || "Что делает персонаж?",
  ];
  return lines.join("\n");
}


/** Formats the non-turn opening scene; it never consumes turn #0001. */
export function formatCampaignOpening(
  turn: GameMasterTurn,
  world: WorldState,
  character: PlayerCharacterState,
  locations: LocationRecord[],
): string {
  return formatGameMasterAnswer(turn, world, character, locations, 1)
    .replace("ХОД #0001 · ПРЕДВАРИТЕЛЬНЫЙ ОТВЕТ МАСТЕРА", "ВСТУПЛЕНИЕ · ПЕРЕД ХОДОМ #0001")
    .replace("НЕ СОХРАНЕНО — требуется проверка и подтверждение игрока", "НЕ ИГРОВОЙ ХОД · ВРЕМЯ И СОСТОЯНИЕ НЕ ИЗМЕНЕНЫ");
}

/** Stores a structured answer without a misleading pending/unsaved label in the append-only journal. */
export function formatArchivedGameMasterAnswer(
  turn: GameMasterTurn,
  world: WorldState,
  character: PlayerCharacterState,
  locations: LocationRecord[],
  turnNumber: number,
): string {
  return formatGameMasterAnswer(turn, world, character, locations, turnNumber)
    .replace(" · ПРЕДВАРИТЕЛЬНЫЙ ОТВЕТ МАСТЕРА", " · ОТВЕТ МАСТЕРА")
    .replace("НЕ СОХРАНЕНО — требуется проверка и подтверждение игрока", "");
}
