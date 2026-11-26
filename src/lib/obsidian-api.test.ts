import { describe, expect, it } from "vitest";

import { createInitialCollections } from "@/domain/defaults";
import { buildBackupEnvelope } from "@/domain/integrity";
import {
  commitCloudTurn,
  createCloudCampaign,
  loadCloudCampaign,
  loadLatestCloudCampaignSnapshot,
  saveCloudCampaignSnapshot,
  saveLinkedCloudSnapshot,
  saveCloudTurnDraft,
  setCloudCampaignLink,
} from "@/lib/obsidian-api";

describe("obsidian-api client input guards", () => {
  it("rejects an empty campaign title before making a network request", async () => {
    const result = await createCloudCampaign("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TITLE");
  });

  it("rejects empty or malformed campaign IDs before bootstrap", async () => {
    const empty = await loadCloudCampaign(" ");
    const malformed = await loadCloudCampaign("campaign-id");
    expect(empty.ok).toBe(false);
    expect(malformed.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("INVALID_CAMPAIGN_ID");
    if (!malformed.ok) expect(malformed.error.code).toBe("INVALID_CAMPAIGN_ID");
  });

  it("rejects drafts without a campaign id or required text", async () => {
    const noCampaign = await saveCloudTurnDraft("", {
      player_action: "Действие",
      gm_resolution: "Разрешение",
    });
    expect(noCampaign.ok).toBe(false);
    if (!noCampaign.ok) expect(noCampaign.error.code).toBe("INVALID_CAMPAIGN_ID");

    const incomplete = await saveCloudTurnDraft("123e4567-e89b-42d3-a456-426614174000", {
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

  it("rejects invalid cloud snapshot IDs and revision counters before network access", async () => {
    const invalidId = await saveCloudCampaignSnapshot("not-a-uuid", 0, 0, {});
    const negativeRevision = await saveCloudCampaignSnapshot("123e4567-e89b-42d3-a456-426614174000", -1, 0, {});
    const invalidTurn = await saveCloudCampaignSnapshot("123e4567-e89b-42d3-a456-426614174000", 0, -1, {});
    const invalidLoad = await loadLatestCloudCampaignSnapshot("bad-id");
    expect(invalidId.ok).toBe(false);
    expect(negativeRevision.ok).toBe(false);
    expect(invalidTurn.ok).toBe(false);
    expect(invalidLoad.ok).toBe(false);
    if (!invalidId.ok) expect(invalidId.error.code).toBe("INVALID_CAMPAIGN_ID");
    if (!negativeRevision.ok) expect(negativeRevision.error.code).toBe("INVALID_SNAPSHOT_REVISION");
    if (!invalidTurn.ok) expect(invalidTurn.error.code).toBe("INVALID_SNAPSHOT_REVISION");
    if (!invalidLoad.ok) expect(invalidLoad.error.code).toBe("INVALID_CAMPAIGN_ID");
  });

  it("keeps turns local when no cloud campaign is linked", async () => {
    setCloudCampaignLink(null);
    const result = await saveLinkedCloudSnapshot(buildBackupEnvelope(createInitialCollections()));
    expect(result).toEqual({ ok: true, skipped: true });
  });
});
