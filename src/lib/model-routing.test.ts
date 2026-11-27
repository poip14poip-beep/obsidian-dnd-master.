import { describe, expect, it } from "vitest";
import { selectCanonExcerpts, selectRuleExcerpts } from "../../supabase/functions/obsidian-gm/model-routing.ts";

describe("knowledge excerpt retrieval", () => {
  it("ranks a rules paragraph by relevant terms instead of source order", () => {
    const source = [
      "Armor Class determines how difficult a creature is to hit.",
      "A Wisdom (Perception) check lets a character notice hidden creatures, sounds, or other details.",
      "A longsword deals slashing damage when it hits.",
    ].join("\n\n");

    const results = selectRuleExcerpts(source, ["Wisdom", "Perception", "notice hidden"], 2_000, 3);

    expect(results[0]?.text).toContain("Wisdom (Perception)");
  });

  it("uses canon heading context when ranking paragraphs", () => {
    const source = [
      "# ЭКДРАСИЛЬ",
      "",
      "## Запас благодати ангела",
      "",
      "Собственная благодать ангела восстанавливается медленно. Молитвы дают дополнительную благодать, которая зависит от новых молитв.",
      "",
      "## Демоны и души",
      "",
      "Демон становится сильнее по мере накопления душ и может существовать без душ.",
    ].join("\n");

    const results = selectCanonExcerpts(source, ["благодать", "ангела", "молитвы"], 4_000, 5);

    expect(results[0]?.headingPath.join(" ")).toContain("Запас благодати ангела");
    expect(results[0]?.text).toContain("Молитвы");
  });

  it("keeps selected source paragraphs whole and respects the character budget", () => {
    const first = "Perception checks reveal details that are not obvious at first glance.";
    const second = "Investigation checks involve reasoning from clues and evidence.";
    const source = [first, second].join("\n\n");

    const results = selectRuleExcerpts(source, ["Perception"], first.length + 139, 5);

    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe(first);
  });
});
