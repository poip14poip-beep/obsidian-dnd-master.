export type DiceTerm = {
  count: number;
  sides: number;
  keep: "highest" | "lowest" | null;
};

export type ParsedDiceFormula = {
  terms: DiceTerm[];
  modifier: number;
  totalDice: number;
};

export type RolledDie = {
  value: number;
  sides: number;
  kept: boolean;
};

export type DiceRollResult = {
  dice: RolledDie[];
  modifier: number;
  total: number;
};

const SUPPORTED_DICE = new Set([4, 6, 8, 10, 12, 20, 100]);

/** Unbiased cryptographically-secure integer in [1, sides]. */
export function rollDie(sides: number): number {
  if (!SUPPORTED_DICE.has(sides)) throw new Error("Неподдерживаемый тип кости.");
  const random = new Uint32Array(1);
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / sides) * sides;
  let value = 0;
  do {
    crypto.getRandomValues(random);
    value = random[0]!;
  } while (value >= limit);
  return value % sides + 1;
}

/**
 * Parses complete D&D dice expressions such as:
 * d20+5, 2d20kh1+5, 2d20kl1-1, 1d8+1d6+3 and d100.
 * Unknown syntax is rejected instead of silently producing a wrong result.
 */
export function parseDiceFormula(formula: string): ParsedDiceFormula | null {
  const compact = formula.replace(/\\s+/g, "");
  if (!compact || compact.length > 80) return null;

  const token = /([+-]?)(?:(\\d*)d(\\d+)(kh1|kl1)?|(\\d+))/gy;
  const terms: DiceTerm[] = [];
  let modifier = 0;
  let totalDice = 0;
  let first = true;

  while (token.lastIndex < compact.length) {
    const match = token.exec(compact);
    if (!match || match[0].length === 0) return null;
    const sign = match[1] || (first ? "+" : "");
    if (!first && sign !== "+" && sign !== "-") return null;

    if (match[3] !== undefined) {
      // Negative dice are not a valid player check expression.
      if (sign === "-") return null;
      const count = Number(match[2] || 1);
      const sides = Number(match[3]);
      const keep = match[4]?.toLowerCase() === "kh1"
        ? "highest"
        : match[4]?.toLowerCase() === "kl1" ? "lowest" : null;
      if (!Number.isInteger(count) || count < 1 || count > 20 ||
          !SUPPORTED_DICE.has(sides) || (keep !== null && count < 2)) return null;
      totalDice += count;
      if (totalDice > 20) return null;
      terms.push({ count, sides, keep });
    } else {
      const value = Number(match[5]);
      if (!Number.isSafeInteger(value) || value > 10000) return null;
      modifier += sign === "-" ? -value : value;
    }
    first = false;
  }

  if (first || terms.length === 0 || Math.abs(modifier) > 10000) return null;
  return { terms, modifier, totalDice };
}

export function rollDiceFormula(
  formula: string,
  random: (sides: number) => number = rollDie,
): DiceRollResult {
  const parsed = parseDiceFormula(formula);
  if (!parsed) throw new Error(`Неподдерживаемая формула броска: ${formula}`);

  const dice: RolledDie[] = [];
  let rolledTotal = 0;
  for (const term of parsed.terms) {
    const values = Array.from({ length: term.count }, () => random(term.sides));
    const keptIndex = term.keep === "highest"
      ? values.indexOf(Math.max(...values))
      : term.keep === "lowest" ? values.indexOf(Math.min(...values)) : -1;
    for (const [index, value] of values.entries()) {
      dice.push({ value, sides: term.sides, kept: keptIndex === -1 || index === keptIndex });
    }
    rolledTotal += keptIndex >= 0
      ? values[keptIndex]!
      : values.reduce((sum, value) => sum + value, 0);
  }
  return { dice, modifier: parsed.modifier, total: rolledTotal + parsed.modifier };
}
