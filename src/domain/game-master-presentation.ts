import type { GameMasterTurn } from "./game-master";
import type { LocationRecord, PlayerCharacterState, WorldState, WorldEnvironment } from "./types";

function known(value: string | null | undefined): string {
  return value && value.trim() && value.trim().toUpperCase() !== "UNKNOWN" ? value.trim() : "НЕ УСТАНОВЛЕНО";
}

function parseTechnicalCalendar(date: string, calendar: string) {
  if (!/technical calendar 1\.0/i.test(calendar)) return null;
  const match = date.match(/(?:^|\D)(\d{1,4})\s*(?:год)?\s*,?\s*месяц\s*(\d{1,2})\s*,?\s*день\s*(\d{1,2})/i);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 13 || day < 1 || (month <= 12 ? day > 30 : day > 5)) return null;
  const dayOfYear = month <= 12 ? (month - 1) * 30 + day : 360 + day;
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
    "ФОНОВЫЕ ЗВУКИ: НЕ УСТАНОВЛЕНО",
    "ЗАПАХИ: НЕ УСТАНОВЛЕНО",
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
    `ФОНОВЫЕ ЗВУКИ: ${known(env.ambientSounds)}`,
    `ЗАПАХИ: ${known(env.ambientSmells)}`,
  ];
}

function sceneMetadata(turn: GameMasterTurn, world: WorldState, character: PlayerCharacterState, locations: LocationRecord[]) {
  const location = locations.find((item) => item.id === (turn.newLocationId ?? world.currentLocationId));
  const place = known(location?.name ?? character.currentLocationLabel ?? world.startLocationName);
  const date = known(turn.newInGameDate) === "НЕ УСТАНОВЛЕНО" ? known(world.currentInGameDate) : known(turn.newInGameDate);
  const timeMatch = date.match(/([01]\d|2[0-3]):([0-5]\d)/);
  const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "НЕ УСТАНОВЛЕНО";
  const hour = timeMatch ? Number(timeMatch[1]) : null;
  const timeOfDay = hour === null ? "НЕ УСТАНОВЛЕНО" : hour < 5 ? "НОЧЬ" : hour < 12 ? "УТРО" : hour < 17 ? "ДЕНЬ" : hour < 22 ? "ВЕЧЕР" : "НОЧЬ";
  const environment = turn.environment ?? world.environment;
  const temperature = !environment || environment.temperatureC === null || environment.temperatureC === undefined
    ? "НЕ УСТАНОВЛЕНО"
    : `${environment.temperatureC} °C${environment.temperatureCertainty === "APPROXIMATE" ? " (приблизительно)" : ""}`;
  return { place, date, time, timeOfDay, temperature };
}

/** Player-facing chat message: compact scene metadata, sensory details and narrative, not a technical report. */
export function formatGameMasterAnswer(
  turn: GameMasterTurn,
  world: WorldState,
  character: PlayerCharacterState,
  locations: LocationRecord[],
  turnNumber: number,
): string {
  const meta = sceneMetadata(turn, world, character, locations);
  return [
    `ХОД #${String(turnNumber).padStart(4, "0")}`,
    `МЕСТО: ${meta.place}`,
    `ДАТА: ${meta.date}`,
    `ВРЕМЯ: ${meta.time} · ${meta.timeOfDay}`,
    `ТЕМПЕРАТУРА: ${meta.temperature}`,
    "",
    "СЕНСОРНОЕ ВОСПРИЯТИЕ",
    turn.sensoryDescription || "Новые ощущения не установлены.",
    "",
    "ОПИСАНИЕ СЦЕНЫ",
    turn.narration,
    "",
    "РЕЗУЛЬТАТ ДЕЙСТВИЯ",
    turn.worldOutcome,
    turn.consequences || turn.consequenceText || "",
    turn.nextAction || "Что делаешь дальше?",
  ].filter(Boolean).join("\\n");
}

/** One-time campaign prehistory. It is saved separately and does not consume a numbered turn. */
export function formatCampaignOpening(
  turn: GameMasterTurn,
  world: WorldState,
  character: PlayerCharacterState,
  locations: LocationRecord[],
): string {
  const meta = sceneMetadata(turn, world, character, locations);
  return [
    "ПРЕДЫСТОРИЯ · КАК ТЫ ОКАЗАЛСЯ ЗДЕСЬ",
    turn.campaignMemory || "Подтверждённые сведения о том, как персонаж прибыл в эту локацию, отсутствуют; мастер не будет выдумывать их.",
    "",
    `МЕСТО: ${meta.place}`,
    `ДАТА: ${meta.date}`,
    `ВРЕМЯ: ${meta.time} · ${meta.timeOfDay}`,
    `ТЕМПЕРАТУРА: ${meta.temperature}`,
    "",
    "СЕНСОРНОЕ ВОСПРИЯТИЕ",
    turn.sensoryDescription || "Новые ощущения не установлены.",
    "",
    "ТЕКУЩАЯ СЦЕНА",
    turn.narration,
    "",
    "Что будешь делать?",
  ].filter(Boolean).join("\\n");
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
