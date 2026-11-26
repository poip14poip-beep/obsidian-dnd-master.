import { describe, expect, it } from "vitest";

import { createInitialCollections } from "./defaults";
import {
  deterministicCloudId,
  mapCloudCampaignSettings,
  mapCloudNpcs,
  mapCloudPlayerCharacter,
  mapCloudSources,
  mapCloudWorldState,
} from "./cloud-mappers";
import type { NpcRecord } from "./types";

const campaignId = "123e4567-e89b-42d3-a456-426614174000";

describe("cloud mapping primitives", () => {
  it("derives stable UUIDv8 values scoped by campaign and collection", async () => {
    const first = await deterministicCloudId(campaignId, "npcs", "npc-1");
    const repeated = await deterministicCloudId(campaignId, "npcs", "npc-1");
    const otherCollection = await deterministicCloudId(campaignId, "factions", "npc-1");

    expect(first).toBe(repeated);
    expect(first).not.toBe(otherCollection);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("maps source types and never upgrades attachment to verification", async () => {
    const sources = createInitialCollections().sources;
    sources[0]!.contentStatus = "ATTACHED";
    sources[0]!.processing = {
      status: "PROCESSED",
      sha256: "a".repeat(64),
      characterCount: 100,
      lineCount: 10,
      sectionCount: 2,
      chunkCount: 2,
      dateCandidateCount: 1,
      processedAt: "2026-11-25T10:00:00.000Z",
      warnings: [],
    };
    sources[1]!.contentStatus = "ATTACHED";

    const mapped = await mapCloudSources(campaignId, sources);
    expect(mapped.rows[0]!.source_type).toBe("master_rules");
    expect(mapped.rows[0]!.content_status).toBe("indexed");
    expect(mapped.rows[0]!.sha256).toBe("a".repeat(64));
    expect(mapped.rows[1]!.source_type).toBe("world_canon");
    expect(mapped.rows[1]!.content_status).toBe("metadata_only");
    expect(mapped.rows[1]!.notes).toContain("[review-status:UNREVIEWED]");
    expect(mapped.rows[1]!.notes).toContain("[context-enabled:false]");
    expect(mapped.rows.find((row) => row.source_type === "player_character")?.source_type).toBe("player_character");
    expect(mapped.rows.every((row) => row.content_status !== ("verified" as string))).toBe(true);
    expect(mapped.rows.every((row) => !("owner_id" in row))).toBe(true);
  });

  it("stores the world partition as one exact snapshot without embedding player state", () => {
    const collections = createInitialCollections();
    collections.world_state.campaignName = "Новая кампания";
    collections.world_state.currentInGameDate = "UNKNOWN";
    const row = mapCloudWorldState(campaignId, collections.world_state);
    const settings = mapCloudCampaignSettings(collections.world_state);

    expect(row.state_key).toBe("world_state_snapshot");
    expect(row.state_value.currentInGameDate).toBe("UNKNOWN");
    expect("player_character_state" in row.state_value).toBe(false);
    expect(settings["obsidian_control"]).toMatchObject({
      ruleset: collections.world_state.ruleset,
      calendar_system: collections.world_state.calendarSystem,
    });
  });

  it("keeps player character data separate and unverified until reviewed", async () => {
    const collections = createInitialCollections();
    collections.player_character_state.name = "Лия Вейн";
    const sources = await mapCloudSources(campaignId, collections.sources);
    const row = await mapCloudPlayerCharacter(
      campaignId,
      collections.player_character_state,
      sources.ids,
    );

    expect(row.character_name).toBe("Лия Вейн");
    expect(row.character_data).toEqual(collections.player_character_state);
    expect(row.source_id).toBe(sources.ids[collections.player_character_state.sourceDossierId]);
    expect(row.verified_at).toBeNull();
    expect("owner_id" in row).toBe(false);
  });

  it("maps NPC knowledge to its own table and preserves non-relational faction identity", async () => {
    const collections = createInitialCollections();
    const sourceMap = await mapCloudSources(campaignId, collections.sources);
    const locationId = await deterministicCloudId(campaignId, "locations", "loc-market");
    const npc: NpcRecord = {
      id: "npc-guard",
      name: "Страж",
      role: "Городской стражник",
      locationId: "loc-market",
      factionId: "faction-watch",
      goals: "Охранять ворота",
      attitudeToPlayer: "UNKNOWN",
      certainty: "APPROXIMATE",
      sourceId: collections.sources[1]!.id,
      locked: false,
      knowledge: [{
        id: "knowledge-1",
        factSummary: "Видел путника у ворот",
        sourceId: collections.sources[1]!.id,
        acquisitionPath: "Личное наблюдение",
        inGameDate: "День 2",
        certainty: "KNOWN",
        recordedAt: "2026-11-25T10:00:00.000Z",
      }],
      version: 1,
      history: [],
    };

    const mapped = await mapCloudNpcs(
      campaignId,
      [npc],
      sourceMap.ids,
      { "loc-market": locationId },
    );

    expect(mapped.npcs).toHaveLength(1);
    expect(mapped.npcs[0]!.current_location_id).toBe(locationId);
    expect(mapped.npcs[0]!.npc_state["faction_id"]).toBe("faction-watch");
    expect(mapped.knowledge).toHaveLength(1);
    expect(mapped.knowledge[0]!.npc_id).toBe(mapped.npcs[0]!.id);
    expect(mapped.knowledge[0]!.status).toBe("KNOWN");
    expect(mapped.knowledge[0]!.acquisition_reason).toContain("День 2");
    expect(mapped.npcs.every((row) => !("owner_id" in row))).toBe(true);
  });

  it("rejects unresolved relational IDs instead of silently dropping them", async () => {
    const collections = createInitialCollections();
    const sourceMap = await mapCloudSources(campaignId, collections.sources);
    const npc: NpcRecord = {
      id: "npc-guard",
      name: "Страж",
      role: "Страж",
      locationId: "missing-location",
      factionId: null,
      goals: "",
      attitudeToPlayer: "",
      certainty: "UNKNOWN",
      sourceId: collections.sources[1]!.id,
      locked: false,
      knowledge: [],
      version: 1,
      history: [],
    };

    await expect(mapCloudNpcs(campaignId, [npc], sourceMap.ids, {}))
      .rejects.toThrow("No cloud location ID");
  });
});
