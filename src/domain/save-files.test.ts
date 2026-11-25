import { describe, expect, it } from "vitest";
import { buildCampaignStateMarkdown, buildPlayerCharacterStateMarkdown, buildSessionLogMarkdown } from "./save-files";
import { createInitialCollections } from "./defaults";
describe("Obsidian markdown save files", () => {
  it("keeps the player character out of CAMPAIGN_STATE", () => {
    const state = createInitialCollections();
    state.player_character_state.name = "Лия Вейн";
    const campaign = buildCampaignStateMarkdown(state, "2026-11-25T00:00:00Z");
    expect(campaign).not.toContain("Лия Вейн");
    expect(buildPlayerCharacterStateMarkdown(state)).toContain("Лия Вейн");
  });
  it("keeps technical notes distinct from numbered game turns", () => {
    const state = createInitialCollections();
    state.session_log.entries.push({ id: "t1", entryType: "TECHNICAL_NOTE", recordedAt: "2026-11-25T00:00:00Z", inGameDateSnapshot: "UNKNOWN", text: "Обсуждение интерфейса", advancesTime: false });
    const log = buildSessionLogMarkdown(state);
    expect(log).toContain("OOC / TECHNICAL NOTE");
    expect(log).not.toContain("TURN #0001");
  });
});
