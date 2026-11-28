// Adapted from the MIT-licensed Open Dungeon Master (mfarme/lorekeeper).
// This module ports the tool-driven adjudication boundary, not its 2014/5e
// rules data. Rule values remain governed by Ekdrasil's D&D 2024 / SRD 5.2.1.
import { parseDiceFormula } from "./dice.ts";

type JsonRecord = Record<string, unknown>;
export type PlayerRollRequest = {
  kind: "skill_check" | "ability_check" | "saving_throw" | "initiative";
  skill?: string;
  ability?: string;
  difficulty?: string;
  dc?: number;
  advantage?: "none" | "advantage" | "disadvantage";
  reason: string;
};
export type PreparedPlayerRoll = {
  roller: "PLAYER";
  label: string;
  formula: string;
  result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА";
  dc: number | null;
  kind: PlayerRollRequest["kind"];
  reason: string;
};
export type PreparedGmRoll = {
  roller: "GM";
  label: string;
  formula: string;
  reason: string;
};

const DC_BY_DIFFICULTY: Record<string, number> = {
  very_easy: 5, easy: 10, moderate: 15, hard: 20, very_hard: 25, nearly_impossible: 30,
};
const ABILITY_NAMES: Record<string, string> = {
  str: "Сила", dex: "Ловкость", con: "Телосложение",
  int: "Интеллект", wis: "Мудрость", cha: "Харизма",
};
const SKILL_NAMES: Record<string, string> = {
  acrobatics: "Акробатика", animal_handling: "Обращение с животными",
  arcana: "Магия", athletics: "Атлетика", deception: "Обман",
  history: "История", insight: "Проницательность", intimidation: "Запугивание",
  investigation: "Расследование", medicine: "Медицина", nature: "Природа",
  perception: "Восприятие", performance: "Выступление", persuasion: "Убеждение",
  religion: "Религия", sleight_of_hand: "Ловкость рук", stealth: "Скрытность",
  survival: "Выживание",
};
const ABILITY_BY_SKILL: Record<string, string> = {
  acrobatics: "dex", animal_handling: "wis", arcana: "int", athletics: "str",
  deception: "cha", history: "int", insight: "wis", intimidation: "cha",
  investigation: "int", medicine: "wis", nature: "int", perception: "wis",
  performance: "cha", persuasion: "cha", religion: "int",
  sleight_of_hand: "dex", stealth: "dex", survival: "wis",
};
function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-zа-яё]/giu, "");
}
function abilityModifier(score: unknown): number | null {
  return Number.isInteger(score) && Number(score) >= 1 && Number(score) <= 30
    ? Math.floor((Number(score) - 10) / 2) : null;
}
function skillBonus(character: JsonRecord, skill: string): number | null {
  const entries = Array.isArray(character.skillBonuses) ? character.skillBonuses : [];
  const aliases = [skill, SKILL_NAMES[skill] ?? ""].map(normalizeKey);
  for (const item of entries) {
    const entry = asRecord(item);
    if (!entry || typeof entry.name !== "string" || !Number.isInteger(entry.bonus)) continue;
    if (aliases.includes(normalizeKey(entry.name))) return Number(entry.bonus);
  }
  return null;
}
function abilityBonus(character: JsonRecord, ability: string, kind: string): number | null {
  const key = ({str:"strength",dex:"dexterity",con:"constitution",int:"intelligence",wis:"wisdom",cha:"charisma"} as Record<string,string>)[ability];
  if (!key) return null;
  if (kind === "saving_throw") {
    const saves = asRecord(character.savingThrowBonuses);
    return saves && Number.isInteger(saves[key]) ? Number(saves[key]) : null;
  }
  if (kind === "initiative") {
    return Number.isInteger(character.initiativeBonus) ? Number(character.initiativeBonus) : null;
  }
  const scores = asRecord(character.abilityScores);
  return abilityModifier(scores?.[key]);
}
function rollFormula(bonus: number, advantage: string): string {
  const dice = advantage === "advantage" ? "2d20kh1" :
    advantage === "disadvantage" ? "2d20kl1" : "1d20";
  return bonus < 0 ? `${dice}${bonus}` : `${dice}+${bonus}`;
}
export function preparePlayerRoll(raw: unknown, rawCharacter: unknown): PreparedPlayerRoll | { error: string } | { noRoll: true; reason: string } {
  const args = asRecord(raw);
  const character = asRecord(rawCharacter);
  if (!args || !character) return { error: "Нет подтверждённого листа персонажа для подготовки броска." };
  if (args.requiresRoll === false) {
    return { noRoll: true, reason: typeof args.reason === "string" ? args.reason.slice(0, 240) : "Бросок по правилам не требуется." };
  }
  if (args.requiresRoll !== true) return { error: "Мастер не указал, требуется ли бросок." };
  if (args.roller !== "PLAYER") return { error: "Этот маршрут предназначен только для броска игрока." };
  const kind = String(args.kind ?? "");
  if (!["skill_check", "ability_check", "saving_throw", "initiative"].includes(kind)) {
    return { error: "Этот тип броска пока не поддержан адаптером. Не подменяй его другой проверкой." };
  }
  const difficulty = typeof args.difficulty === "string" ? DC_BY_DIFFICULTY[args.difficulty] : undefined;
  const dc = Number.isInteger(args.dc) ? Number(args.dc) : difficulty;
  if (kind !== "initiative" && (dc === undefined || dc < 1 || dc > 40)) {
    return { error: "Для проверки нужна подтверждённая сложность или DC." };
  }
  let bonus: number | null = null;
  let label = "";
  if (kind === "skill_check") {
    const skill = String(args.skill ?? "");
    if (!SKILL_NAMES[skill]) return { error: "Не указан допустимый навык D&D 2024." };
    bonus = skillBonus(character, skill);
    label = `${ABILITY_NAMES[ABILITY_BY_SKILL[skill]!]} (${SKILL_NAMES[skill]})`;
  } else {
    const ability = kind === "initiative" ? "dex" : String(args.ability ?? "");
    if (!ABILITY_NAMES[ability]) return { error: "Не указана характеристика для проверки." };
    bonus = abilityBonus(character, ability, kind);
    label = kind === "initiative" ? "Инициатива" : kind === "saving_throw"
      ? `Спасбросок: ${ABILITY_NAMES[ability]}` : `Проверка характеристики: ${ABILITY_NAMES[ability]}`;
  }
  if (bonus === null) return { error: "В листе нет подтверждённого бонуса для этой проверки. Нужна проверка листа или уточнение." };
  const advantage = args.advantage === "advantage" || args.advantage === "disadvantage" ? args.advantage : "none";
  const formula = rollFormula(bonus, advantage);
  if (!parseDiceFormula(formula)) return { error: "Движок сформировал неподдерживаемую формулу броска." };
  const reason = typeof args.reason === "string" ? args.reason.slice(0, 240) : "Проверка действия персонажа";
  return {
    roller: "PLAYER", label, formula, result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА",
    dc: dc ?? null, kind: kind as PlayerRollRequest["kind"], reason,
  };
}

export function prepareGmRoll(raw: unknown): PreparedGmRoll | { error: string } {
  const args = asRecord(raw);
  if (!args || args.requiresRoll !== true || args.roller !== "GM" || args.kind !== "custom") {
    return { error: "Некорректный запрос серверного броска NPC/окружения." };
  }
  const expression = typeof args.expression === "string" ? args.expression : "";
  if (!parseDiceFormula(expression)) return { error: "Для серверного броска нужна подтверждённая формула костей." };
  return {
    roller: "GM",
    label: typeof args.reason === "string" ? args.reason.slice(0, 120) : "Бросок NPC/окружения",
    formula: expression,
    reason: typeof args.reason === "string" ? args.reason.slice(0, 240) : "Бросок NPC/окружения",
  };
}
