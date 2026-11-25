import type {
  NpcRecord,
  PlayerCharacterState,
  SourceDocument,
  WorldState,
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CloudSourceRow {
  id: string;
  campaign_id: string;
  title: string;
  source_type: "master_rules" | "world_canon" | "player_character" | "other";
  version_label: string | null;
  sha256: string | null;
  source_uri: null;
  content_status: "metadata_only" | "indexed";
  notes: string;
}

export interface CloudWorldStateRow {
  campaign_id: string;
  state_key: "world_state_snapshot";
  state_value: WorldState;
  status: "KNOWN";
  source_id: null;
  justification: string;
}

export interface CloudPlayerCharacterRow {
  id: string;
  campaign_id: string;
  character_name: string | null;
  character_data: PlayerCharacterState;
  source_id: string;
  verified_at: null;
}

export interface CloudNpcRow {
  id: string;
  campaign_id: string;
  canonical_name: string;
  current_location_id: string | null;
  npc_state: Record<string, unknown>;
  source_id: string;
}

export interface CloudNpcKnowledgeRow {
  id: string;
  npc_id: string;
  knowledge: string;
  status: "KNOWN" | "APPROXIMATE" | "UNKNOWN";
  source_id: string;
  acquisition_reason: string;
  acquired_at: string | null;
}

export interface CloudSourceMapping {
  rows: CloudSourceRow[];
  ids: Record<string, string>;
}

export interface CloudNpcMapping {
  npcs: CloudNpcRow[];
  knowledge: CloudNpcKnowledgeRow[];
}

export class CloudMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudMappingError";
  }
}

function assertCampaignId(campaignId: string): void {
  if (!UUID_PATTERN.test(campaignId)) {
    throw new CloudMappingError("Cloud campaign ID must be a valid UUID.");
  }
}

/**
 * Stable UUIDv8 derived from campaign + collection + local ID.
 * This lets the same local entity retain its cloud identity across devices
 * without storing a second mutable ID registry in localStorage.
 */
export async function deterministicCloudId(
  campaignId: string,
  collection: string,
  localId: string,
): Promise<string> {
  assertCampaignId(campaignId);
  if (!collection.trim() || !localId.trim()) {
    throw new CloudMappingError("Collection and local entity ID are required.");
  }
  const input = new TextEncoder().encode(
    `obsidian-control:v1:${campaignId.toLowerCase()}:${collection}:${localId}`,
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  const bytes = new Uint8Array(digest.slice(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sourceTypeToDatabase(
  type: SourceDocument["type"],
): CloudSourceRow["source_type"] {
  switch (type) {
    case "GOVERNING_DOC":
      return "master_rules";
    case "WORLD_CANON":
      return "world_canon";
    case "PLAYER_DOSSIER":
      return "player_character";
    case "SUPPLEMENTAL":
      return "other";
  }
}

function isSha256(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function sourceContentStatus(source: SourceDocument): CloudSourceRow["content_status"] {
  // Local attachment/processing is never equivalent to human verification.
  return source.contentStatus === "ATTACHED" && source.processing?.status === "PROCESSED"
    ? "indexed"
    : "metadata_only";
}

export async function mapCloudSources(
  campaignId: string,
  sources: SourceDocument[],
): Promise<CloudSourceMapping> {
  assertCampaignId(campaignId);
  const rows: CloudSourceRow[] = [];
  const ids: Record<string, string> = {};
  for (const source of sources) {
    if (ids[source.id]) throw new CloudMappingError(`Duplicate local source ID: ${source.id}`);
    const id = await deterministicCloudId(campaignId, "sources", source.id);
    ids[source.id] = id;
    const digest = isSha256(source.processing?.sha256)
      ? source.processing.sha256
      : isSha256(source.checksum)
        ? source.checksum
        : null;
    const notes = [
      `[obsidian-local-id:${source.id}]`,
      source.originLabel,
      source.notes,
      `[review-status:${source.reviewStatus ?? "UNREVIEWED"}]`,
      `[context-enabled:${source.contextEnabled === true ? "true" : "false"}]`,
    ].filter(Boolean).join("\n");
    rows.push({
      id,
      campaign_id: campaignId,
      title: source.title,
      source_type: sourceTypeToDatabase(source.type),
      version_label: source.processing?.status === "PROCESSED" ? "processed-v1" : null,
      sha256: digest,
      source_uri: null,
      content_status: sourceContentStatus(source),
      notes,
    });
  }
  return { rows, ids };
}

export function mapCloudCampaignSettings(worldState: WorldState): Record<string, unknown> {
  return {
    obsidian_control: {
      schema_version: worldState.schemaVersion,
      state_version: worldState.stateVersion,
      ruleset: worldState.ruleset,
      calendar_system: worldState.calendarSystem,
      start_in_game_date: worldState.startInGameDate,
      current_in_game_date: worldState.currentInGameDate,
      elapsed_minutes: worldState.elapsedMinutes,
      encumbrance_mode: worldState.encumbranceMode,
      start_location_name: worldState.startLocationName,
      current_location_local_id: worldState.currentLocationId,
      setup: worldState.setup,
      updated_at: worldState.updatedAt,
    },
  };
}

export function mapCloudWorldState(
  campaignId: string,
  worldState: WorldState,
): CloudWorldStateRow {
  assertCampaignId(campaignId);
  return {
    campaign_id: campaignId,
    state_key: "world_state_snapshot",
    // The certainty of individual values (including UNKNOWN/APPROXIMATE) is
    // preserved verbatim inside this exact snapshot; KNOWN describes the saved record.
    state_value: worldState,
    status: "KNOWN",
    source_id: null,
    justification: "Exact snapshot of the separate local world_state collection.",
  };
}

export async function mapCloudPlayerCharacter(
  campaignId: string,
  character: PlayerCharacterState,
  sourceIds: Record<string, string>,
): Promise<CloudPlayerCharacterRow> {
  assertCampaignId(campaignId);
  const sourceId = sourceIds[character.sourceDossierId];
  if (!sourceId || !UUID_PATTERN.test(sourceId)) {
    throw new CloudMappingError(
      `No cloud source ID is available for player dossier ${character.sourceDossierId}.`,
    );
  }
  return {
    id: await deterministicCloudId(campaignId, "player_character_state", "singleton"),
    campaign_id: campaignId,
    character_name: character.name === "UNKNOWN" ? null : character.name,
    character_data: character,
    source_id: sourceId,
    // Verification is a separate human-reviewed operation, never inferred from import.
    verified_at: null,
  };
}

function parseIsoTimestamp(value: string): string | null {
  if (!value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export async function mapCloudNpcs(
  campaignId: string,
  npcs: NpcRecord[],
  sourceIds: Record<string, string>,
  locationIds: Record<string, string>,
): Promise<CloudNpcMapping> {
  assertCampaignId(campaignId);
  const npcRows: CloudNpcRow[] = [];
  const knowledgeRows: CloudNpcKnowledgeRow[] = [];
  const seenNpcIds = new Set<string>();

  for (const npc of npcs) {
    if (seenNpcIds.has(npc.id)) throw new CloudMappingError(`Duplicate local NPC ID: ${npc.id}`);
    seenNpcIds.add(npc.id);
    const sourceId = sourceIds[npc.sourceId];
    if (!sourceId || !UUID_PATTERN.test(sourceId)) {
      throw new CloudMappingError(`No cloud source ID is available for NPC ${npc.name}.`);
    }
    const currentLocationId = npc.locationId ? (locationIds[npc.locationId] ?? null) : null;
    if (npc.locationId && (!currentLocationId || !UUID_PATTERN.test(currentLocationId))) {
      throw new CloudMappingError(`No cloud location ID is available for NPC ${npc.name}.`);
    }

    const npcId = await deterministicCloudId(campaignId, "npcs", npc.id);
    npcRows.push({
      id: npcId,
      campaign_id: campaignId,
      canonical_name: npc.name,
      current_location_id: currentLocationId,
      source_id: sourceId,
      // factionId has no relational column in the current DB contract; preserve it
      // inside npc_state rather than silently discarding the relationship.
      npc_state: {
        local_id: npc.id,
        role: npc.role,
        faction_id: npc.factionId,
        goals: npc.goals,
        attitude_to_player: npc.attitudeToPlayer,
        certainty: npc.certainty,
        locked: npc.locked,
        version: npc.version,
        history: npc.history,
      },
    });

    for (const entry of npc.knowledge) {
      const knowledgeSourceId = sourceIds[entry.sourceId];
      if (!knowledgeSourceId || !UUID_PATTERN.test(knowledgeSourceId)) {
        throw new CloudMappingError(
          `No cloud source ID is available for knowledge entry of NPC ${npc.name}.`,
        );
      }
      knowledgeRows.push({
        id: await deterministicCloudId(campaignId, "npc_knowledge", `${npc.id}:${entry.id}`),
        npc_id: npcId,
        knowledge: entry.factSummary,
        status: entry.certainty,
        source_id: knowledgeSourceId,
        acquisition_reason: [
          entry.acquisitionPath,
          entry.inGameDate ? `In-game date: ${entry.inGameDate}` : "",
        ].filter(Boolean).join("\n"),
        acquired_at: parseIsoTimestamp(entry.recordedAt),
      });
    }
  }

  return { npcs: npcRows, knowledge: knowledgeRows };
}
