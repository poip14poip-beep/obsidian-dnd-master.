import type { HitDicePool, PlayerCharacterState } from "./types";
import { applyConditionChanges, getExhaustionLevel } from "./conditions";

export type RestKind = "SHORT" | "LONG";

export interface RestCalculation {
  ok: boolean;
  error: string | null;
  warnings: string[];
  elapsedMinutes: number;
  hpCurrent: number | null;
  conditions: string[];
  resources: PlayerCharacterState["resources"];
  hitDicePool: HitDicePool[] | undefined;
  hitDiceSpent: number;
  hitDiceRecovered: number;
  healingFromHitDice: number;
}

const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/[ё]/g, "е");

export function createInitialHitDicePool(hitDice: string | null | undefined, classLevel: number | null | undefined): HitDicePool[] | undefined {
  if (!hitDice || !Number.isInteger(classLevel) || !classLevel || classLevel < 1 || classLevel > 20) return undefined;
  const match = /^(?:1d)?(4|6|8|10|12)$/i.exec(hitDice.trim());
  if (!match) return undefined;
  const die = `d${Number(match[1])}`;
  return [{ die, current: classLevel, maximum: classLevel }];
}

function resourceRecovers(resourceRecovery: string, kind: RestKind): boolean {
  const value = normalize(resourceRecovery);
  const shortRest = (value.includes("short rest") || value.includes("short/long rest") || value.includes("коротк")) && (value.includes("rest") || value.includes("отдых"));
  const longRest = value.includes("long rest") || value.includes("продолжительн") || value.includes("длительн");
  return kind === "SHORT" ? shortRest : longRest || shortRest;
}

export function calculateRest(
  character: PlayerCharacterState,
  kind: RestKind,
  hitDiceToSpend = 0,
  hitDieRolls: number[] = [],
): RestCalculation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const elapsedMinutes = kind === "SHORT" ? 60 : 480;

  if (!Number.isInteger(hitDiceToSpend) || hitDiceToSpend < 0) {
    errors.push("Количество костей хитов должно быть целым неотрицательным числом.");
  }
  if (kind === "LONG" && hitDiceToSpend !== 0) {
    errors.push("Во время продолжительного отдыха нельзя тратить кости хитов для лечения: здоровье восстанавливается полностью.");
  }

  const pool = (character.hitDicePool ?? []).map((entry) => ({ ...entry }));
  if (pool.some((entry) => !/^d(?:4|6|8|10|12)$/i.test(entry.die) ||
      !Number.isInteger(entry.current) || !Number.isInteger(entry.maximum) ||
      entry.maximum < 0 || entry.maximum > 20 || entry.current < 0 || entry.current > entry.maximum)) {
    errors.push("Запас костей хитов повреждён или не подтверждён; отдых не может его изменить.");
  }
  const available = pool.reduce((sum, entry) => sum + entry.current, 0);
  if (hitDiceToSpend > available) errors.push(`Нельзя потратить ${hitDiceToSpend} костей хитов: доступно ${available}.`);
  if (hitDiceToSpend > 0 && pool.length === 0) errors.push("Текущий запас костей хитов не подтверждён листом персонажа.");
  if (hitDieRolls.length !== hitDiceToSpend) errors.push("Для каждой потраченной кости хитов нужен отдельный результат броска.");
  if (hitDieRolls.some((roll) => !Number.isInteger(roll) || roll < 1 || roll > 12)) errors.push("Результат кости хитов вне допустимого диапазона.");

  if (errors.length) {
    return {
      ok: false, error: errors.join(" "), warnings, elapsedMinutes,
      hpCurrent: character.hpCurrent, conditions: [...character.conditions],
      resources: [...character.resources], hitDicePool: character.hitDicePool?.map((entry) => ({ ...entry })),
      hitDiceSpent: 0, hitDiceRecovered: 0, healingFromHitDice: 0,
    };
  }

  let hpCurrent = character.hpCurrent;
  let healingFromHitDice = 0;
  let hitDiceSpent = 0;
  let hitDiceRecovered = 0;
  let nextConditions = [...character.conditions];
  let nextPool = pool;

  if (kind === "SHORT" && hitDiceToSpend > 0) {
    if (hpCurrent === null || character.hpMax === null || !character.abilityScores) {
      return {
        ok: false, error: "Нельзя восстановить HP костями хитов: текущие HP, максимум HP или Телосложение не подтверждены.",
        warnings, elapsedMinutes, hpCurrent, conditions: nextConditions, resources: [...character.resources],
        hitDicePool: character.hitDicePool?.map((entry) => ({ ...entry })), hitDiceSpent: 0,
        hitDiceRecovered: 0, healingFromHitDice: 0,
      };
    }
    const constitutionModifier = Math.floor((character.abilityScores.constitution - 10) / 2);
    let rollIndex = 0;
    for (const entry of nextPool) {
      while (entry.current > 0 && hitDiceSpent < hitDiceToSpend) {
        const roll = hitDieRolls[rollIndex++]!;
        const sides = Number(entry.die.replace(/^d/i, ""));
        if (!Number.isInteger(sides) || roll > sides) {
          return {
            ok: false, error: `Результат броска не соответствует кости ${entry.die}.`, warnings, elapsedMinutes,
            hpCurrent: character.hpCurrent, conditions: [...character.conditions], resources: [...character.resources],
            hitDicePool: character.hitDicePool?.map((item) => ({ ...item })), hitDiceSpent: 0,
            hitDiceRecovered: 0, healingFromHitDice: 0,
          };
        }
        healingFromHitDice += Math.max(0, roll + constitutionModifier);
        entry.current -= 1;
        hitDiceSpent += 1;
      }
      if (hitDiceSpent >= hitDiceToSpend) break;
    }
    hpCurrent = Math.min(character.hpMax, hpCurrent + healingFromHitDice);
  }

  if (kind === "LONG") {
    if (character.hpMax === null) {
      warnings.push("HP не восстановлены: максимальные HP не подтверждены.");
    } else {
      hpCurrent = character.hpMax;
    }
    const exhaustion = getExhaustionLevel(nextConditions);
    if (exhaustion > 1) {
      const result = applyConditionChanges(nextConditions, [{ action: "ADD", name: `Истощение ${exhaustion - 1}` }]);
      nextConditions = result.conditions;
    } else if (exhaustion === 1) {
      const result = applyConditionChanges(nextConditions, [{ action: "REMOVE", name: "Истощение" }]);
      nextConditions = result.conditions;
    }
    if (nextPool.length > 0) {
      const spent = nextPool.reduce((sum, entry) => sum + entry.maximum - entry.current, 0);
      let remainingRecovery = Math.min(spent, Math.max(1, Math.floor(nextPool.reduce((sum, entry) => sum + entry.maximum, 0) / 2)));
      for (const entry of nextPool) {
        const recover = Math.min(entry.maximum - entry.current, remainingRecovery);
        entry.current += recover;
        remainingRecovery -= recover;
        hitDiceRecovered += recover;
      }
    }
  }

  const resources = character.resources.map((resource) => {
    if (!resourceRecovers(resource.recovery, kind)) return { ...resource };
    if (resource.current === null || resource.max === null) {
      warnings.push(`Ресурс «${resource.name}» не восстановлен: текущее или максимальное значение неизвестно.`);
      return { ...resource };
    }
    return { ...resource, current: resource.max };
  });

  return {
    ok: true, error: null, warnings, elapsedMinutes, hpCurrent, conditions: nextConditions,
    resources, hitDicePool: character.hitDicePool ? nextPool : undefined,
    hitDiceSpent, hitDiceRecovered, healingFromHitDice,
  };
}
