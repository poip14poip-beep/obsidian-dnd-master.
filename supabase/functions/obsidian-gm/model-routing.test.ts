import { describe, expect, it } from "vitest";
import { selectGameplayRuleExcerpts } from "./model-routing";

const rules = [
  "# Combat",
  "",
  "Attack Rolls. An attack roll is a d20 test against the target Armor Class.",
  "",
  "# Ability Checks",
  "",
  "Ability Checks. An ability check uses a d20 test and the relevant ability modifier.",
  "",
  "# Saving Throws",
  "",
  "Saving Throws. A saving throw resists a harmful effect.",
].join("\n");

describe("gameplay-aware SRD retrieval", () => {
  it("preloads core rules when a Russian action has no English SRD keyword match", () => {
    const excerpts = selectGameplayRuleExcerpts(rules, ["случайного", "прохожего"], 2_000, 8);
    expect(excerpts.length).toBeGreaterThan(0);
    expect(excerpts.some((excerpt) => /attack roll/i.test(excerpt.text))).toBe(true);
    expect(excerpts.some((excerpt) => /ability check/i.test(excerpt.text))).toBe(true);
  });

  it("keeps action-specific rules when matching excerpts exist", () => {
    const excerpts = selectGameplayRuleExcerpts(rules, ["attack roll", "armor class"], 2_000, 8);
    expect(excerpts.length).toBe(1);
    expect(excerpts[0]?.text).toContain("Attack Rolls");
  });
});
