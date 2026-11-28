/**
 * Canonical, backward-compatible character condition handling.
 *
 * The persisted character sheet still stores conditions as strings so existing
 * campaigns remain readable. This module gives those strings deterministic
 * names and makes add/remove operations idempotent.
 */

export const STANDARD_CONDITIONS = [
  { key: "blinded", label: "Ослеплён", aliases: ["blinded", "ослеплён", "ослеплен", "слепота"] },
  { key: "charmed", label: "Очарован", aliases: ["charmed", "очарован", "очарование"] },
  { key: "deafened", label: "Оглох", aliases: ["deafened", "оглох", "оглушён слух", "глухота"] },
  { key: "exhaustion", label: "Истощение", aliases: ["exhaustion", "истощение"] },
  { key: "frightened", label: "Испуган", aliases: ["frightened", "испуган", "испуг"] },
  { key: "grappled", label: "Схвачен", aliases: ["grappled", "схвачен", "захвачен"] },
  { key: "incapacitated", label: "Недееспособен", aliases: ["incapacitated", "недееспособен", "недееспособность"] },
  { key: "invisible", label: "Невидим", aliases: ["invisible", "невидим", "невидимость"] },
  { key: "paralyzed", label: "Парализован", aliases: ["paralyzed", "парализован", "паралич"] },
  { key: "petrified", label: "Окаменел", aliases: ["petrified", "окаменел", "окаменение"] },
  { key: "poisoned", label: "Отравлен", aliases: ["poisoned", "отравлен", "отравление"] },
  { key: "prone", label: "Сбит с ног", aliases: ["prone", "сбит с ног", "лежит ничком", "ничком"] },
  { key: "restrained", label: "Опутан", aliases: ["restrained", "опутан", "скован"] },
  { key: "stunned", label: "Ошеломлён", aliases: ["stunned", "ошеломлён", "ошеломлен", "оглушён", "оглушен"] },
  { key: "unconscious", label: "Без сознания", aliases: ["unconscious", "без сознания", "бессознательный"] },
] as const;

export type StandardConditionKey = typeof STANDARD_CONDITIONS[number]["key"];

export interface ConditionChange {
  action: "ADD" | "REMOVE";
  name: string;
}

export interface ConditionChangesResult {
  conditions: string[];
  errors: string[];
}

const normalizeText = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replace(/[ё]/g, "е").replace(/\\s+/g, " ");

const aliasToCondition = new Map<string, typeof STANDARD_CONDITIONS[number]>();
for (const condition of STANDARD_CONDITIONS) {
  aliasToCondition.set(normalizeText(condition.key), condition);
  aliasToCondition.set(normalizeText(condition.label), condition);
  for (const alias of condition.aliases) aliasToCondition.set(normalizeText(alias), condition);
}

export interface ParsedCondition {
  key: string;
  label: string;
  exhaustionLevel?: number;
  standard: boolean;
}

/** Resolve known D&D conditions while preserving Ekdrasil-specific custom conditions. */
export function parseConditionName(raw: string): ParsedCondition | null {
  if (typeof raw !== "string") return null;
  const normalized = normalizeText(raw);
  if (!normalized || normalized.length > 100) return null;

  const exhaustion = /^(?:exhaustion|истощение)(?:\\s+(?:level\\s*)?)?\\s*([1-6])?$/.exec(normalized);
  if (exhaustion) {
    const level = exhaustion[1] ? Number(exhaustion[1]) : 1;
    return { key: "exhaustion", label: "Истощение", exhaustionLevel: level, standard: true };
  }

  const standard = aliasToCondition.get(normalized);
  if (standard) return { key: standard.key, label: standard.label, standard: true };

  // Unknown names are legitimate Ekdrasil curses, mutations and other campaign states.
  return { key: normalized, label: raw.normalize("NFKC").trim().replace(/\\s+/g, " "), standard: false };
}

function sameCondition(left: string, right: ParsedCondition): boolean {
  const parsed = parseConditionName(left);
  return parsed?.key === right.key &&
    (right.key !== "exhaustion" || parsed.exhaustionLevel === right.exhaustionLevel);
}

/**
 * Apply condition changes in order. ADD is idempotent; exhaustion ADD sets the
 * explicit level. REMOVE of bare exhaustion removes any level, while a numbered
 * removal only succeeds when that exact level is present.
 */
export function applyConditionChanges(
  current: readonly string[],
  changes: readonly ConditionChange[],
): ConditionChangesResult {
  const conditions = current.map((item) => String(item).trim()).filter(Boolean);
  const errors: string[] = [];

  for (const change of changes) {
    if (!change || !["ADD", "REMOVE"].includes(change.action) || typeof change.name !== "string") {
      errors.push("Изменение состояния имеет некорректный формат.");
      continue;
    }
    const parsed = parseConditionName(change.name);
    if (!parsed) {
      errors.push("Название состояния пустое или превышает допустимую длину.");
      continue;
    }

    if (parsed.key === "exhaustion") {
      const existingIndex = conditions.findIndex((item) => parseConditionName(item)?.key === "exhaustion");
      if (change.action === "ADD") {
        const value = `Истощение ${parsed.exhaustionLevel ?? 1}`;
        if (existingIndex >= 0) conditions.splice(existingIndex, 1, value);
        else conditions.push(value);
      } else if (existingIndex < 0) {
        errors.push("Нельзя снять истощение: оно не записано у персонажа.");
      } else {
        const existing = parseConditionName(conditions[existingIndex]!);
        if (parsed.exhaustionLevel !== 1 && existing?.exhaustionLevel !== parsed.exhaustionLevel) {
          errors.push("Уровень истощения изменился; снятие отклонено, чтобы не удалить другое состояние.");
        } else {
          conditions.splice(existingIndex, 1);
        }
      }
      continue;
    }

    const index = conditions.findIndex((item) => sameCondition(item, parsed));
    if (change.action === "ADD") {
      if (index < 0) conditions.push(parsed.label);
    } else if (index < 0) {
      errors.push(`Нельзя снять состояние «${parsed.label}»: оно не записано у персонажа.`);
    } else {
      conditions.splice(index, 1);
    }
  }

  return { conditions, errors };
}

export function getExhaustionLevel(conditions: readonly string[]): number {
  const entry = conditions.map((item) => parseConditionName(item))
    .find((item) => item?.key === "exhaustion");
  return entry?.exhaustionLevel ?? 0;
}
