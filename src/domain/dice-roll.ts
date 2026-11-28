export interface DiceRollResult {
  formula: string;
  dice: number[];
  modifier: number;
  total: number;
  display: string;
}

function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) {
    throw new Error("Некорректный диапазон броска.");
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Криптографический генератор случайных чисел недоступен на этом устройстве.");
  }
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    globalThis.crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);
  return value % maxExclusive;
}

/** Rolls a bounded D&D-style expression such as 1d20+5 or 2d6-1. */
export function rollDiceExpression(
  formula: string,
  randomInt: (maxExclusive: number) => number = secureRandomInt,
): DiceRollResult {
  const normalized = formula.trim().replace(/\s+/g, "").toLowerCase();
  const match = normalized.match(/^(?:(\d{1,2}))?d(\d{1,4})(?:([+-])(\d{1,4}))?$/);
  if (!match) throw new Error("Формула броска не распознана. Поддерживаются выражения вида 1d20+5.");
  const count = Number(match[1] ?? 1);
  const sides = Number(match[2]);
  const modifier = match[4] ? Number(match[4]) * (match[3] === "-" ? -1 : 1) : 0;
  if (count < 1 || count > 20 || sides < 2 || sides > 1000 || Math.abs(modifier) > 1000) {
    throw new Error("Формула броска выходит за допустимые пределы.");
  }
  const dice = Array.from({ length: count }, () => {
    const value = randomInt(sides);
    if (!Number.isInteger(value) || value < 0 || value >= sides) {
      throw new Error("Генератор вернул недопустимое значение кубика.");
    }
    return value + 1;
  });
  const total = dice.reduce((sum, value) => sum + value, modifier);
  const diceText = dice.join(" + ");
  const modifierText = modifier === 0 ? "" : modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
  return {
    formula: normalized,
    dice,
    modifier,
    total,
    display: `[${diceText}]${modifierText} = ${total}`,
  };
}
