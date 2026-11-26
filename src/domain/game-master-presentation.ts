import type { GameMasterTurn } from "./game-master";

function cleanText(value: string | null | undefined, fallback: string): string {
  const text = (value ?? "").replace(/\\n/g, "\n").trim();
  return text || fallback;
}

function normalizeSensoryFeed(value: string | null | undefined): string {
  const source = cleanText(value, "");
  if (!source) return [
    "Зрение: окружающая сцена видна естественно и достаточно чётко.",
    "Слух: слышен обычный фон окружающего места.",
    "Осязание: одежда касается кожи, опора под ногами ощущается.",
    "Обоняние: ощущается естественный фон окружающей среды.",
    "Вкус: нейтральный вкус во рту.",
    "Терморецепция: ощущается температура окружающего воздуха.",
    "Вестибулярный аппарат: равновесие устойчивое.",
    "Проприоцепция: положение тела и конечностей ощущается естественно.",
    "Интероцепция: дыхание и внутреннее состояние без заметных отклонений.",
  ].join("\n");
  return source;
}

export function formatGameMasterAnswer(turn: GameMasterTurn, _world?: unknown, _character?: unknown, _locations?: unknown, turnNumber = 1): string {
  return [
    `ХОД #${String(turnNumber).padStart(4, "0")}`,
    "",
    "СЕНСОРНЫЙ ВОД",
    normalizeSensoryFeed(turn.sensoryDescription),
    "",
    "ТЕКУЩАЯ СЦЕНА",
    cleanText(turn.narration, "Сцена пока не описана."),
  ].join("\n");
}

export function formatCampaignOpening(turn: GameMasterTurn, _world?: unknown, _character?: unknown, _locations?: unknown): string {
  return [
    "ПРЕДЫСТОРИЯ",
    cleanText(turn.campaignMemory, "Предыстория персонажа до начала кампании остаётся открытой."),
    "",
    "СЕНСОРНЫЙ ВОД",
    normalizeSensoryFeed(turn.sensoryDescription),
    "",
    "ТЕКУЩАЯ СЦЕНА",
    cleanText(turn.narration, "Начальная сцена пока не описана."),
  ].join("\n");
}

export function formatArchivedGameMasterAnswer(turn: GameMasterTurn, world?: unknown, character?: unknown, locations?: unknown, turnNumber = 1): string {
  return formatGameMasterAnswer(turn, world, character, locations, turnNumber)
    .replace(" · ПРЕДВАРИТЕЛЬНЫЙ ОТВЕТ МАСТЕРА", " · ОТВЕТ МАСТЕРА")
    .replace("НЕ СОХРАНЕНО — требуется проверка и подтверждение игрока", "");
}