import { describe, expect, it } from "vitest";
import { abilityModifier, carryingLimits, currencyWeightLb, d20TestTotal, DND_2024_RULE_COVERAGE, exhaustionEffects, proficiencyBonus, spellAttackBonus, spellSaveDC } from "./rules-2024";

describe("D&D 2024 baseline rules", () => {
  it("calculates ability modifiers and proficiency by level", () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(20)).toBe(5);
    expect([1, 5, 9, 13, 17]).toEqual([1, 5, 9, 13, 17].filter(level => proficiencyBonus(level) === Math.floor((level - 1) / 4) + 2));
  });
  it("calculates spell save DC and attack bonus", () => {
    expect(spellSaveDC(16, 3)).toBe(14);
    expect(spellAttackBonus(16, 3)).toBe(6);
  });
  it("calculates size-adjusted carrying and push/drag/lift limits", () => {
    expect(carryingLimits(20, "MEDIUM")).toEqual({ carryingCapacityLb: 300, pushDragLiftLimitLb: 600 });
    expect(carryingLimits(20, "TINY")).toEqual({ carryingCapacityLb: 150, pushDragLiftLimitLb: 300 });
  });
  it("uses the 2024 exhaustion progression", () => {
    expect(exhaustionEffects(3)).toEqual({ d20Penalty: -6, speedPenaltyFeet: -15, dies: false });
    expect(exhaustionEffects(6).dies).toBe(true);
  });
  it("calculates coin weight and exhaustion-adjusted D20 Tests", () => {
    expect(currencyWeightLb({ cp: 10, sp: 10, ep: 10, gp: 10, pp: 10 })).toBe(1);
    expect(d20TestTotal(15, 14, 3, true, 1)).toBe(17);
  });
  it("does not falsely claim every rule domain is already implemented", () => {
    expect(DND_2024_RULE_COVERAGE.some(rule => rule.coverage === "REFERENCE_REQUIRED")).toBe(true);
  });
});
