import { describe, expect, it } from "vitest";

import { createInitialCollections } from "./defaults";
import {
  deterministicCloudId,
  mapCloudCampaignSettings,
  mapCloudNpcs,
  mapCloudAuditLog,
  mapCloudCampaignCollections,
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

  it("maps source types and preserves explicit verification for trusted and reviewed sources", async () => {
    const sources = createInitialCollections().sources;
    sources[0]!.serverManaged = false;
    sources[0]!.contentStatus = "ATTACHED";
    sources[0]!.reviewStatus = "VERIFIED";
    sources[0]!.contextEnabled = true;
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
    sources[1]!.reviewStatus = "UNREVIEWED";
    sources[1]!.contextEnabled = false;
    sources[1]!.reviewStatus = "UNREVIEWED";
    sources[1]!.contextEnabled = false;

    const mapped = await mapCloudSources(campaignId, sources);
    expect(mapped.rows[0]!.source_type).toBe("master_rules");
    expect(mapped.rows[0]!.content_status).toBe("verified");
    expect(mapped.rows[0]!.sha256).toBe("a".repeat(64));
    expect(mapped.rows[1]!.source_type).toBe("world_canon");
    expect(mapped.rows[1]!.content_status).toBe("metadata_only");
    expect(mapped.rows[1]!.notes).toContain("[review-status:UNREVIEWED]");
    expect(mapped.rows[1]!.notes).toContain("[context-enabled:false]");
    expect(mapped.rows.find((row) => row.source_type === "player_character")?.source_type).toBe("player_character");
    expect(mapped.rows.find((row) => row.source_type === "other")?.content_status).toBe("verified");
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
    collections.player_character_state.name = "Тестовый персонаж";
    const sources = await mapCloudSources(campaignId, collections.sources);
    const row = await mapCloudPlayerCharacter(
      campaignId,
      collections.player_character_state,
      sources.ids,
    );

    expect(row.character_name).toBe("Тестовый персонаж");
    expect(row.character_data).toEqual(collections.player_character_state);
    expect(row.source_id).toBe(sources.ids[collections.player_character_state.sourceDossierId]);
    expect(row.verified_at).toBeNull();
    expect("owner_id" in row).toBe(false);
  });

  it("maps NPC knowledge to its own table and preserves non-relational faction identity", async () => {
    const collections = createInitialCollections();
    const sourceMap = await mapCloudSources(campaignId, collections.sources);
    const locationId = await deterministicCloudId(campaignId, "locations", "loc-market");
    const factionId = await deterministicCloudId(campaignId, "factions", "faction-watch");
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
      playerKnowledge: [{
        id: "player-knowledge-1",
        factSummary: "Персонаж заметил знак на плаще",
        sourceId: "MANUAL_GM_ENTRY",
        acquisitionPath: "Личное наблюдение",
        inGameDate: "День 2",
        certainty: "KNOWN",
        recordedAt: "2026-11-25T10:00:00.000Z",
      }],
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
      { "faction-watch": factionId },
    );

    expect(mapped.npcs).toHaveLength(1);
    expect(mapped.npcs[0]!.current_location_id).toBe(locationId);
    expect(mapped.npcs[0]!.npc_state["faction_id"]).toBe(factionId);
    expect(mapped.npcs[0]!.npc_state["player_knowledge"]).toHaveLength(1);
    expect(mapped.knowledge).toHaveLength(1);
    expect(mapped.knowledge[0]!.npc_id).toBe(mapped.npcs[0]!.id);
    expect(mapped.knowledge[0]!.status).toBe("KNOWN");
    expect(mapped.knowledge[0]!.acquisition_reason).toContain("День 2");
    expect(mapped.npcs.every((row) => !("owner_id" in row))).toBe(true);
  });

  it("keeps manual GM-created NPCs and knowledge when no source row exists", async () => {
    const npc: NpcRecord = {
      id: "npc-manual",
      name: "Случайный прохожий",
      role: "UNKNOWN",
      locationId: null,
      factionId: null,
      goals: "UNKNOWN",
      attitudeToPlayer: "UNKNOWN",
      certainty: "UNKNOWN",
      sourceId: "MANUAL_GM_ENTRY",
      locked: false,
      knowledge: [{
        id: "knowledge-manual",
        factSummary: "Вышел из лавки",
        sourceId: "MANUAL_GM_ENTRY",
        acquisitionPath: "Личное наблюдение персонажа",
        inGameDate: "UNKNOWN",
        certainty: "KNOWN",
        recordedAt: "2026-11-27T10:00:00.000Z",
      }],
      version: 1,
      history: [],
    };
    const mapped = await mapCloudNpcs(campaignId, [npc], {}, {});
    expect(mapped.npcs[0]?.source_id).toBeNull();
    expect(mapped.knowledge[0]?.source_id).toBeNull();
    expect(mapped.knowledge[0]?.acquisition_reason).toContain("Личное наблюдение");
  });

  it("maps all remaining local collections with deterministic relational IDs", async () => {
    const collections = createInitialCollections();
    collections.world_state.campaignName = "Кампания";
    collections.world_state.setup = {
      sourcesConfirmed: true,
      parametersConfirmed: true,
      startPointConfirmed: true,
      characterConfirmed: true,
      noAutoImportAcknowledged: true,
      confirmed: true,
      confirmedAt: "2026-11-27T10:00:00.000Z",
    };
    collections.player_character_state.name = "Лия";
    collections.player_character_state.sourceDossierId = "GENERATED_RANDOM";
    collections.sources[3]!.contentStatus = "ATTACHED";
    collections.sources[3]!.reviewStatus = "VERIFIED";
    collections.sources[3]!.contextEnabled = true;
    collections.sources[3]!.processing = {
      status: "PROCESSED", sha256: "c".repeat(64), characterCount: 100, lineCount: 10,
      sectionCount: 1, chunkCount: 1, dateCandidateCount: 0,
      processedAt: "2026-11-27T10:00:00.000Z", warnings: [],
    };
    const sourceId = collections.sources[1]!.id;
    collections.locations = [{
      id: "loc-start", name: "Эйргард", region: "Север", cityName: "Эйргард",
      placeName: "Рыночная площадь", description: "Центральная площадь",
      certainty: "KNOWN", sourceId,
    }];
    collections.world_state.currentLocationId = "loc-start";
    collections.factions = [{
      id: "faction-watch", name: "Стража", goals: "Порядок", resources: "Городская стража",
      standing: "Нейтральное", certainty: "KNOWN", sourceId, locked: false, version: 1, history: [],
    }];
    collections.npcs = [{
      id: "npc-1", name: "Стражник", role: "Страж", locationId: "loc-start", factionId: "faction-watch",
      goals: "Охранять рынок", resources: "Форма и оружие", attitudeToPlayer: "UNKNOWN",
      certainty: "KNOWN", sourceId, locked: false, knowledge: [], playerKnowledge: [],
      version: 1, history: [],
    }];
    collections.canon_facts = [{
      id: "fact-1", title: "Факт", statement: "Стража охраняет рынок", rationale: "Наблюдение",
      layer: "OBJECTIVE_TRUTH", subjectNpcId: null, certainty: "KNOWN", sourceId,
      acquisitionPath: "Осмотр", inGameDate: "UNKNOWN", scope: "LOCATION", locked: true,
      createdAt: "2026-11-27T10:00:00.000Z", version: 1, history: [],
    }];
    collections.timeline_events = [{
      id: "event-1", title: "Смена караула", triggerInGameDate: "UNKNOWN", consequence: "Караул сменится",
      status: "SCHEDULED", certainty: "KNOWN", sourceId,
    }];
    const mapped = await mapCloudCampaignCollections(campaignId, collections, "2026-11-27T10:00:00.000Z");
    expect(mapped.campaign.status).toBe("active");
    expect(mapped.campaign.current_location_id).toBe(mapped.locations[0]?.id);
    expect(mapped.player_character_state.verified_at).toBe("2026-11-27T10:00:00.000Z");
    expect(mapped.sources.find((row) => row.title === "Персонаж, созданный генератором ОБСИДИАН")?.content_status).toBe("verified");
    expect(mapped.factions[0]?.faction_state).toMatchObject({ goals: "Порядок", standing: "Нейтральное" });
    expect(mapped.locations[0]?.geography).toMatchObject({ region: "Север", place_name: "Рыночная площадь" });
    expect(mapped.npcs[0]?.npc_state).toMatchObject({ faction_id: mapped.factions[0]?.id, resources: "Форма и оружие" });
    expect(mapped.canon_facts[0]?.fact_class).toBe("objective");
    expect(mapped.timeline_events[0]?.status).toBe("planned");
    expect("player_character_state" in mapped.world_state.state_value).toBe(false);
  });

  it("maps technical notes into audit history without inventing game turns", async () => {
    const collections = createInitialCollections();
    collections.session_log = {
      schemaVersion: 1,
      lastTurnNumber: 0,
      entries: [{
        id: "note-1", entryType: "TECHNICAL_NOTE", recordedAt: "2026-11-27T10:00:00.000Z",
        inGameDateSnapshot: "UNKNOWN", text: "Проверка", advancesTime: false,
      }],
    };
    const audit = await mapCloudAuditLog(campaignId, collections.audit_log, collections.session_log);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("TECHNICAL_NOTE_ADDED");
    expect(audit[0]?.details).toMatchObject({ text: "Проверка", advances_time: false });
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
