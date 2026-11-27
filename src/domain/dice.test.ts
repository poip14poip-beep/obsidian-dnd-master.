import { describe, expect, it } from "vitest";
import { parseDiceFormula, rollDiceFormula } from "./dice";

describe("D&D dice formulas", () => {
  it.each([
    ["d20+5", 1, 20, 5],
    ["2d20kh1 + 5", 2, 20, 5],
    ["2d20kl1-1", 2, 20, -1],
    ["1d8+1d6+3", 2, 8, 3],
    ["d100", 1, 100, 0],
    ["4d6kh1", 4, 6, 0],
  ])("parses %s", (formula, diceCount, firstSides, modifier) => {
    const parsed = parseDiceFormula(formula);
    expect(parsed).not.toBeNull();
    expect(parsed!.totalDice).toBe(diceCount);
    expect(parsed!.terms[0]!.sides).toBe(firstSides);
    expect(parsed!.modifier).toBe(modifier);
  });

  it.each(["", "1d7", "1d20+5junk", "-1d20", "21d20", "2d20kh1kl1", "1d20+99999"])(
    "rejects unsupported or unsafe formula %s",
    (formula) => expect(parseDiceFormula(formula)).toBeNull(),
  );

  it("keeps the higher d20 for advantage and adds the modifier once", () => {
    const values = [4, 17];
    const result = rollDiceFormula("2d20kh1+5", () => values.shift()!);
    expect(result.dice.map((die) => die.kept)).toEqual([false, true]);
    expect(result.total).toBe(22);
  });

  it("keeps the lower d20 for disadvantage", () => {
    const values = [4, 17];
    const result = rollDiceFormula("2d20kl1+2", () => values.shift()!);
    expect(result.dice.map((die) => die.kept)).toEqual([true, false]);
    expect(result.total).toBe(6);
  });

  it("rolls each die in a multi-die damage expression", () => {
    const values = [6, 4];
    const result = rollDiceFormula("1d8+1d6+3", () => values.shift()!);
    expect(result.dice.map((die) => [die.value, die.sides])).toEqual([[6, 8], [4, 6]]);
    expect(result.total).toBe(13);
  });
});
