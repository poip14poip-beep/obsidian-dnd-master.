import { describe, expect, it } from "vitest";

import {
  commitCloudTurn,
  createCloudCampaign,
  loadCloudCampaign,
  saveCloudTurnDraft,
} from "@/lib/obsidian-api";

describe("obsidian-api client input guards", () => {
  it("rejects an empty campaign title before making a network request", async () => {
    const result = await createCloudCampaign("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TITLE");
  });

  it("rejects an empty campaign id before bootstrap", async () => {
    const result = await loadCloudCampaign(" ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CAMPAIGN_ID");
  });

  it("rejects drafts without a campaign id or required text", async () => {
    const noCampaign = await saveCloudTurnDraft("", {
      player_action: "Действие",
      gm_resolution: "Разрешение",
    });
    expect(noCampaign.ok).toBe(false);
    if (!noCampaign.ok) expect(noCampaign.error.code).toBe("INVALID_CAMPAIGN_ID");

    const incomplete = await saveCloudTurnDraft("campaign-id", {
      player_action: " ",
      gm_resolution: "Разрешение",
    });
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) expect(incomplete.error.code).toBe("INVALID_DRAFT");
  });

  it("rejects an empty draft id before commit", async () => {
    const result = await commitCloudTurn("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_DRAFT_ID");
  });
});
