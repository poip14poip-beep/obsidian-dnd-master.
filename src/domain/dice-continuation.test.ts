import { describe, expect, it } from "vitest";
import { buildDiceContinuationAction } from "./dice-continuation";
describe("dice continuation", () => {
  it("sends player-entered results as separate lines without rolling again", () => {
    const result = buildDiceContinuationAction("Осмотреть дверь", [
      { label: "Внимательность", formula: "1d20+5" },
      { label: "Проницательность", formula: "1d20+3" },
    ], { 0: "18", 1: "12" });
    expect(result).toContain("Внимательность (1d20+5): 18");
    expect(result).toContain("Проницательность (1d20+3): 12");
    expect(result.split(String.fromCharCode(10))).toHaveLength(6);
    expect(result).toContain("Не перебрасывай и не заменяй их.");
  });
  it("refuses incomplete roll input", () => {
    expect(() => buildDiceContinuationAction("Осмотреть дверь", [{ label: "Внимательность", formula: "1d20" }], {}))
      .toThrow("Не введён результат броска");
  });
});
