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
    "ИГРОВОЙ ГОД: НЕ УСТАНОВЛЕНО",
    "МЕСЯЦ: НЕ УСТАНОВЛЕНО",
    "ДЕНЬ: НЕ УСТАНОВЛЕНО",
    "ДЕНЬ НЕДЕЛИ: НЕ УСТАНОВЛЕНО",
    `ВРЕМЯ: ${time}`,
    "ВРЕМЯ СУТОК: НЕ УСТАНОВЛЕНО",
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
