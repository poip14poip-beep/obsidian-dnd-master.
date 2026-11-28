import { describe, expect, it } from "vitest";
import { rollDiceExpression } from "./dice-roll";

describe("player dice roller", () => {
  it("rolls a d20 and adds the character modifier", () => {
    const result = rollDiceExpression("1d20 + 5", () => 17);
    expect(result.dice).toEqual([18]);
    expect(result.total).toBe(23);
    expect(result.display).toBe("[18] + 5 = 23");
  });

  it("supports multiple dice and negative modifiers", () => {
    const values = [0, 5, 2];
    const result = rollDiceExpression("3d6-1", () => values.shift() ?? 0);
    expect(result.dice).toEqual([1, 6, 3]);
    expect(result.total).toBe(9);
  });

  it("rejects unsupported or unsafe expressions", () => {
    expect(() => rollDiceExpression("1d20+5; alert(1)", () => 0)).toThrow("Формула броска не распознана");
    expect(() => rollDiceExpression("99d20", () => 0)).toThrow("выходит за допустимые пределы");
  });

  it("rejects an invalid random source result", () => {
    expect(() => rollDiceExpression("1d20", () => 20)).toThrow("недопустимое значение");
  });
});
