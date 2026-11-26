import type { GameMasterTurn } from "./game-master";
import type { LocationRecord, PlayerCharacterState, WorldState, WorldEnvironment } from "./types";

function known(value: string | null | undefined): string {
  return value && value.trim() && value.trim().toUpperCase() !== "UNKNOWN" ? value.trim() : "НЕ УСТАНОВЛЕНО";
}

function parseTechnicalCalendar(date: string, calendar: string) {
  if (!/technical calendar 1\\.0/i.test(calendar)) return null;
  const match = date.match(/(?:^|\\D)(\\d{1,4})\\s*(?:год)?\\s*,?\\s*месяц\\s*(\\d{1,2})\\s*,?\\s*день\\s*(\\d{1,2})/i);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 30) return null;
  const dayOfYear = (month - 1) * 30 + day;
  return { year, month, day, dayOfYear, week: Math.floor((dayOfYear - 1) / 7) + 1, weekday: ((dayOfYear - 1) % 7) + 1 };
}

function formatEnvironment(environment: WorldEnvironment | undefined): string[] {
  const env = environment;
  if (!env) return [
    "ТЕМПЕРАТУРА: НЕ УСТАНОВЛЕНО",
    "ПОГОДА: НЕ УСТАНОВЛЕНО",
    "ОСВЕЩЕНИЕ: НЕ УСТАНОВЛЕНО",
    "ВИДИМОСТЬ: НЕ УСТАНОВЛЕНО",
    "ВЕТЕР: НЕ УСТАНОВЛЕНО",
    "ОСАДКИ: НЕ УСТАНОВЛЕНО",
  ];
  const temp = env.temperatureC === null || env.temperatureC === undefined
    ? "НЕ УСТАНОВЛЕНО"
    : `${env.temperatureC} °C (${env.temperatureCertainty})`;
  return [
    `ТЕМПЕРАТУРА: ${temp}`,
    `ПОГОДА: ${known(env.weather)}`,
    `ОСВЕЩЕНИЕ: ${known(env.lighting)}`,
    `ВИДИМОСТЬ: ${known(env.visibility)}`,
    `ВЕТЕР: ${known(env.wind)}`,
    `ОСАДКИ: ${known(env.precipitation)}`,
  ];
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
  const timeMatch = date.match(/(?:^|\\b)([01]\\d|2[0-3]):([0-5]\\d)(?:\\b|$)/);
  const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "НЕ УСТАНОВЛЕНО";
  const numericDate = parseTechnicalCalendar(date, world.calendarSystem);
  const fallbackYear = date.match(/(?:год|year)\\s*[:№]?\\s*(\\d{1,4})|(?:^|\\s|[,(])(\\d{1,4})\\s*(?:год|г\\.?|year)(?:\\s|[,(]|$)/i);
  const year = numericDate ? String(numericDate.year) : fallbackYear ? (fallbackYear[1] ?? fallbackYear[2]) + (/APPROXIMATE|ПРИБЛИЗИТЕЛЬНО/i.test(date) ? " (APPROXIMATE)" : "") : "НЕ УСТАНОВЛЕНО";
  const month = numericDate ? String(numericDate.month).padStart(2, "0") : "НЕ УСТАНОВЛЕНО";
  const day = numericDate ? String(numericDate.day).padStart(2, "0") : "НЕ УСТАНОВЛЕНО";
  const week = numericDate ? String(numericDate.week) : "НЕ УСТАНОВЛЕНО";
  const weekday = numericDate ? String(numericDate.weekday) : "НЕ УСТАНОВЛЕНО";
  const hour = timeMatch ? Number(timeMatch[1]) : null;
  const timeOfDay = hour === null ? "НЕ УСТАНОВЛЕНО" : hour < 5 ? "НОЧЬ" : hour < 12 ? "УТРО" : hour < 17 ? "ДЕНЬ" : hour < 22 ? "ВЕЧЕР" : "НОЧЬ";
  const envLines = formatEnvironment(turn.environment ?? world.environment);
  const lines = [
    "════════════════════════════════════",
    `ХОД #${String(turnNumber).padStart(4, "0")} · ПРЕДВАРИТЕЛЬНЫЙ ОТВЕТ МАСТЕРА`,
    "НЕ СОХРАНЕНО — требуется проверка и подтверждение игрока",
    "════════════════════════════════════",
    "",
    "КАМПАНИЯ:",
    known(world.campaignName),
    `ИГРОВОЙ ГОД: ${year}`,
    `МЕСЯЦ: ${month}`,
    `ДЕНЬ: ${day}`,
    `НЕДЕЛЯ ГОДА: ${week}`,
    `ДЕНЬ НЕДЕЛИ: ${weekday}`,
    `ВРЕМЯ: ${time}`,
    `ВРЕМЯ СУТОК: ${timeOfDay}`,
    `МЕСТО: ${place}`,
    `РЕГИОН / ГОРОД / РАЙОН: ${region}`,
    `ТОЧНАЯ ЛОКАЦИЯ: ${place}`,
    ...envLines,
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
    turn.environmentReason ? `Изменение среды: ${turn.environmentReason}` : "",
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
  return lines.filter((line) => line !== "").join("\\n");
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
