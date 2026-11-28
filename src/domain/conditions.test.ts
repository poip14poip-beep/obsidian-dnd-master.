import { describe, expect, it } from "vitest";
import { applyConditionChanges, getExhaustionLevel, parseConditionName } from "./conditions";

describe("canonical character conditions", () => {
  it("normalizes Russian and English names to the same standard condition", () => {
    expect(parseConditionName("Blinded")?.key).toBe("blinded");
    expect(parseConditionName("ослеплён")?.key).toBe("blinded");
    expect(parseConditionName("Без сознания")?.key).toBe("unconscious");
  });

  it("preserves Ekdrasil-specific custom conditions", () => {
    expect(parseConditionName("Проклятие чёрного инея")).toMatchObject({
      key: "проклятие черного инея",
      label: "Проклятие чёрного инея",
      standard: false,
    });
  });

  it("adds a standard condition once and removes it by either language", () => {
    const added = applyConditionChanges([], [
      { action: "ADD", name: "Frightened" },
      { action: "ADD", name: "Испуган" },
    ]);
    expect(added.errors).toEqual([]);
    expect(added.conditions).toEqual(["Испуган"]);

    const removed = applyConditionChanges(added.conditions, [{ action: "REMOVE", name: "frightened" }]);
    expect(removed.errors).toEqual([]);
    expect(removed.conditions).toEqual([]);
  });

  it("sets exhaustion to an explicit level instead of accumulating duplicate strings", () => {
    const result = applyConditionChanges(["Истощение 1", "Отравлен"], [
      { action: "ADD", name: "Exhaustion 3" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.conditions).toEqual(["Истощение 3", "Отравлен"]);
    expect(getExhaustionLevel(result.conditions)).toBe(3);
  });

  it("removes any exhaustion level by the bare condition name", () => {
    const result = applyConditionChanges(["Истощение 4"], [{ action: "REMOVE", name: "Истощение" }]);
    expect(result.errors).toEqual([]);
    expect(result.conditions).toEqual([]);
  });

  it("does not remove a different exhaustion level when a numbered removal is stale", () => {
    const result = applyConditionChanges(["Истощение 3"], [{ action: "REMOVE", name: "Истощение 2" }]);
    expect(result.conditions).toEqual(["Истощение 3"]);
    expect(result.errors).toHaveLength(1);
  });

  it("reports attempts to remove a condition that is not active", () => {
    const result = applyConditionChanges([], [{ action: "REMOVE", name: "Парализован" }]);
    expect(result.conditions).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});
