import type {
  AuditLogState,
  CanonFact,
  DelayedEvent,
  FactionRecord,
  GameTurnEntry,
  LocationRecord,
  NpcRecord,
  ObsidianCollections,
  PlayerCharacterState,
  SessionLogState,
  SourceDocument,
  TurnDraft,
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
  content_status: "metadata_only" | "indexed" | "verified";
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
  verified_at: string | null;
}

export interface CloudNpcRow {
  id: string;
  campaign_id: string;
  canonical_name: string;
  current_location_id: string | null;
  npc_state: Record<string, unknown>;
  source_id: string | null;
}

export interface CloudNpcKnowledgeRow {
  id: string;
  npc_id: string;
  knowledge: string;
  status: "KNOWN" | "APPROXIMATE" | "UNKNOWN";
  source_id: string | null;
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

export interface CloudFactionRow {
  id: string;
  campaign_id: string;
  name: string;
  faction_state: Record<string, unknown>;
  source_id: string | null;
}

export interface CloudLocationRow {
  id: string;
  campaign_id: string;
  name: string;
  parent_location_id: null;
  geography: Record<string, unknown>;
  source_id: string | null;
}

export interface CloudCanonFactRow {
  id: string;
  campaign_id: string;
  fact_class: "objective" | "player" | "npc" | "out_of_game";
  status: "KNOWN" | "APPROXIMATE" | "UNKNOWN";
  statement: string;
  source_id: string | null;
  justification: string;
  valid_from: string | null;
  valid_until: null;
}

export interface CloudTimelineEventRow {
  id: string;
  campaign_id: string;
  event_time: string | null;
  time_precision: "exact" | "approximate" | "unknown";
  description: string;
  status: "planned" | "occurred" | "cancelled" | "unknown";
  source_id: string | null;
}

export interface CloudTurnDraftRow {
  id: string;
  campaign_id: string;
  proposed_turn: number;
  player_action: string;
  gm_resolution: string;
  pending_changes: Record<string, unknown>;
  status: "draft" | "ready_to_commit";
}

export interface CloudSessionLogRow {
  id: string;
  campaign_id: string;
  turn_number: number;
  occurred_at: string;
  player_action: string;
  gm_resolution: string;
  state_delta: Record<string, unknown>;
  source_draft_id: null;
  payload_sha256: string;
}

export interface CloudAuditLogRow {
  id: string;
  campaign_id: string;
  action: string;
  entity_type: string;
  entity_id: null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface CloudCampaignStateMapping {
  campaign: {
    title: string;
    status: "preparation" | "ready" | "active";
    campaign_date: string;
    current_location_id: string | null;
    last_confirmed_turn: number;
    settings: Record<string, unknown>;
  };
  sources: CloudSourceRow[];
  world_state: CloudWorldStateRow;
  player_character_state: CloudPlayerCharacterRow;
  npcs: CloudNpcRow[];
  npc_knowledge: CloudNpcKnowledgeRow[];
  factions: CloudFactionRow[];
  locations: CloudLocationRow[];
  timeline_events: CloudTimelineEventRow[];
  canon_facts: CloudCanonFactRow[];
  turn_drafts: CloudTurnDraftRow[];
  session_log: CloudSessionLogRow[];
  audit_log: CloudAuditLogRow[];
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
  // Server-managed sources have no campaign content row: their full text is
  // held in the private GM base. Their verified marker is still required by
  // the authoritative turn-commit gate.
  if (source.serverManaged) {
    return source.reviewStatus === "VERIFIED" && source.contextEnabled === true &&
      source.processing?.status === "PROCESSED" ? "verified" : "metadata_only";
  }
  if (source.contentStatus !== "ATTACHED" || source.processing?.status !== "PROCESSED" ||
      source.contextEnabled !== true) return "metadata_only";
  return source.reviewStatus === "VERIFIED" ? "verified" : "indexed";
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
  verifiedAt: string | null = null,
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
    // Only an explicit, completed campaign setup may mark the imported character verified.
    verified_at: parseIsoTimestamp(verifiedAt ?? ""),
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
  factionIds: Record<string, string> = {},
): Promise<CloudNpcMapping> {
  assertCampaignId(campaignId);
  const npcRows: CloudNpcRow[] = [];
  const knowledgeRows: CloudNpcKnowledgeRow[] = [];
  const seenNpcIds = new Set<string>();

  for (const npc of npcs) {
    if (seenNpcIds.has(npc.id)) throw new CloudMappingError(`Duplicate local NPC ID: ${npc.id}`);
    seenNpcIds.add(npc.id);
    const sourceId = npc.sourceId === "MANUAL_GM_ENTRY" ? null : sourceIds[npc.sourceId] ?? null;
    if (npc.sourceId !== "MANUAL_GM_ENTRY" && (!sourceId || !UUID_PATTERN.test(sourceId))) {
      throw new CloudMappingError(`No cloud source ID is available for NPC ${npc.name}.`);
    }
    const currentLocationId = npc.locationId ? (locationIds[npc.locationId] ?? null) : null;
    if (npc.locationId && (!currentLocationId || !UUID_PATTERN.test(currentLocationId))) {
      throw new CloudMappingError(`No cloud location ID is available for NPC ${npc.name}.`);
    }
    const factionId = npc.factionId ? (factionIds[npc.factionId] ?? null) : null;
    if (npc.factionId && (!factionId || !UUID_PATTERN.test(factionId))) {
      throw new CloudMappingError(`No cloud faction ID is available for NPC ${npc.name}.`);
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
        faction_id: factionId,
        goals: npc.goals,
        resources: npc.resources ?? "",
        attitude_to_player: npc.attitudeToPlayer,
        certainty: npc.certainty,
        locked: npc.locked,
        version: npc.version,
        history: npc.history,
      player_knowledge: await Promise.all((npc.playerKnowledge ?? []).map(async (entry) => {
        const playerKnowledgeSourceId = entry.sourceId === "MANUAL_GM_ENTRY" ? null : sourceIds[entry.sourceId] ?? null;
        if (entry.sourceId !== "MANUAL_GM_ENTRY" && (!playerKnowledgeSourceId || !UUID_PATTERN.test(playerKnowledgeSourceId))) {
          throw new CloudMappingError("No cloud source ID is available for player knowledge of NPC " + npc.name + ".");
        }
        return {
          id: await deterministicCloudId(campaignId, "npc_player_knowledge", npc.id + ":" + entry.id),
          fact_summary: entry.factSummary,
          source_id: playerKnowledgeSourceId,
          acquisition_path: entry.acquisitionPath,
          in_game_date: entry.inGameDate,
          certainty: entry.certainty,
          recorded_at: parseIsoTimestamp(entry.recordedAt),
        };
      })),
      },
    });

    for (const entry of npc.knowledge) {
      const knowledgeSourceId = entry.sourceId === "MANUAL_GM_ENTRY" ? null : sourceIds[entry.sourceId] ?? null;
      if (entry.sourceId !== "MANUAL_GM_ENTRY" && (!knowledgeSourceId || !UUID_PATTERN.test(knowledgeSourceId))) {
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

function resolveCloudSourceId(
  sourceId: string,
  sourceIds: Record<string, string>,
  label: string,
): string | null {
  if (!sourceId || sourceId === "MANUAL_GM_ENTRY") return null;
  const mapped = sourceIds[sourceId];
  if (!mapped || !UUID_PATTERN.test(mapped)) {
    throw new CloudMappingError("No cloud source ID is available for " + label + ".");
  }
  return mapped;
}

export async function mapCloudFactions(
  campaignId: string,
  factions: FactionRecord[],
  sourceIds: Record<string, string>,
): Promise<{ rows: CloudFactionRow[]; ids: Record<string, string> }> {
  assertCampaignId(campaignId);
  const rows: CloudFactionRow[] = [];
  const ids: Record<string, string> = {};
  for (const faction of factions) {
    if (ids[faction.id]) throw new CloudMappingError("Duplicate local faction ID: " + faction.id);
    const id = await deterministicCloudId(campaignId, "factions", faction.id);
    ids[faction.id] = id;
    rows.push({
      id,
      campaign_id: campaignId,
      name: faction.name,
      source_id: resolveCloudSourceId(faction.sourceId, sourceIds, "faction " + faction.name),
      faction_state: {
        local_id: faction.id,
        goals: faction.goals,
        resources: faction.resources,
        standing: faction.standing,
        certainty: faction.certainty,
        locked: faction.locked,
        version: faction.version,
        history: faction.history,
      },
    });
  }
  return { rows, ids };
}

export async function mapCloudLocations(
  campaignId: string,
  locations: LocationRecord[],
  sourceIds: Record<string, string>,
): Promise<{ rows: CloudLocationRow[]; ids: Record<string, string> }> {
  assertCampaignId(campaignId);
  const rows: CloudLocationRow[] = [];
  const ids: Record<string, string> = {};
  for (const location of locations) {
    if (ids[location.id]) throw new CloudMappingError("Duplicate local location ID: " + location.id);
    const id = await deterministicCloudId(campaignId, "locations", location.id);
    ids[location.id] = id;
    rows.push({
      id,
      campaign_id: campaignId,
      name: location.name,
      parent_location_id: null,
      source_id: resolveCloudSourceId(location.sourceId, sourceIds, "location " + location.name),
      geography: {
        local_id: location.id,
        region: location.region,
        city_name: location.cityName ?? null,
        place_name: location.placeName ?? null,
        description: location.description,
        certainty: location.certainty,
      },
    });
  }
  return { rows, ids };
}

export async function mapCloudCanonFacts(
  campaignId: string,
  facts: CanonFact[],
  sourceIds: Record<string, string>,
): Promise<CloudCanonFactRow[]> {
  assertCampaignId(campaignId);
  const rows: CloudCanonFactRow[] = [];
  const seen = new Set<string>();
  const classMap: Record<CanonFact["layer"], CloudCanonFactRow["fact_class"]> = {
    OBJECTIVE_TRUTH: "objective",
    PLAYER_KNOWLEDGE: "player",
    NPC_KNOWLEDGE: "npc",
    OUT_OF_GAME: "out_of_game",
  };
  for (const fact of facts) {
    if (seen.has(fact.id)) throw new CloudMappingError("Duplicate local canon fact ID: " + fact.id);
    seen.add(fact.id);
    rows.push({
      id: await deterministicCloudId(campaignId, "canon_facts", fact.id),
      campaign_id: campaignId,
      fact_class: classMap[fact.layer],
      status: fact.certainty,
      statement: fact.statement,
      source_id: resolveCloudSourceId(fact.sourceId, sourceIds, "canon fact " + fact.title),
      justification: JSON.stringify({
        local_id: fact.id,
        title: fact.title,
        rationale: fact.rationale,
        acquisition_path: fact.acquisitionPath,
        in_game_date: fact.inGameDate,
        scope: fact.scope,
        subject_npc_local_id: fact.subjectNpcId,
        locked: fact.locked,
        version: fact.version,
        history: fact.history,
      }),
      valid_from: parseIsoTimestamp(fact.inGameDate),
      valid_until: null,
    });
  }
  return rows;
}

export async function mapCloudTimelineEvents(
  campaignId: string,
  events: DelayedEvent[],
  sourceIds: Record<string, string>,
): Promise<CloudTimelineEventRow[]> {
  assertCampaignId(campaignId);
  const rows: CloudTimelineEventRow[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id)) throw new CloudMappingError("Duplicate local timeline event ID: " + event.id);
    seen.add(event.id);
    const eventTime = parseIsoTimestamp(event.triggerInGameDate);
    const precision: CloudTimelineEventRow["time_precision"] = eventTime
      ? (event.triggerInGameDate.includes("T") ? "exact" : "approximate")
      : "unknown";
    const status: CloudTimelineEventRow["status"] = event.status === "SCHEDULED"
      ? "planned"
      : event.status === "TRIGGERED" || event.status === "RESOLVED" ? "occurred" : "unknown";
    rows.push({
      id: await deterministicCloudId(campaignId, "timeline_events", event.id),
      campaign_id: campaignId,
      event_time: eventTime,
      time_precision: precision,
      description: event.title + "\n" + event.consequence + "\n[local-status:" + event.status + "; certainty:" + event.certainty + "]",
      status,
      source_id: resolveCloudSourceId(event.sourceId, sourceIds, "timeline event " + event.title),
    });
  }
  return rows;
}

export async function mapCloudTurnDrafts(
  campaignId: string,
  drafts: TurnDraft[],
  sourceIds: Record<string, string>,
  locationIds: Record<string, string>,
  nextTurnNumber: number,
): Promise<CloudTurnDraftRow[]> {
  assertCampaignId(campaignId);
  const rows: CloudTurnDraftRow[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    if (seen.has(draft.id)) throw new CloudMappingError("Duplicate local turn draft ID: " + draft.id);
    seen.add(draft.id);
    const mappedLocationId = draft.newLocationId ? (locationIds[draft.newLocationId] ?? null) : null;
    if (draft.newLocationId && !mappedLocationId) {
      throw new CloudMappingError("No cloud location ID is available for the active turn draft.");
    }
    const hasNewFact = Boolean(draft.newFactTitle.trim() && draft.newFactStatement.trim());
    const pendingChanges: Record<string, unknown> = {
      summary: draft.summary,
      world_outcome: draft.worldOutcome,
      gm_narration: draft.gmNarration ?? "",
      campaign_memory: draft.campaignMemory ?? "",
      time_delta_minutes: draft.timeDeltaMinutes,
      new_in_game_date: draft.newInGameDate,
      new_location_id: mappedLocationId,
      hp_delta: draft.hpDelta,
      consequence_text: draft.consequenceText,
      environment: draft.environment ?? null,
      environment_reason: draft.environmentReason ?? "",
      quest_changes: draft.questChanges ?? [],
      character_changes: draft.characterChanges ?? {
        inventory: [], resources: [], conditions: [],
        currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      npc_changes: draft.npcChanges ?? [],
      rolls: draft.rolls,
      new_fact: hasNewFact ? {
        title: draft.newFactTitle,
        statement: draft.newFactStatement,
        rationale: draft.newFactRationale,
        fact_class: draft.newFactLayer,
        status: draft.newFactCertainty,
        source_id: resolveCloudSourceId(draft.newFactSourceId, sourceIds, "new turn fact"),
      } : null,
      checked_at: draft.checkedAt,
      validation_errors: draft.validationErrors,
    };
    rows.push({
      id: await deterministicCloudId(campaignId, "turn_drafts", draft.id),
      campaign_id: campaignId,
      proposed_turn: nextTurnNumber,
      player_action: draft.playerIntent,
      gm_resolution: draft.gmNarration ?? draft.worldOutcome,
      pending_changes: pendingChanges,
      status: draft.checkedAt && draft.validationErrors.length === 0 ? "ready_to_commit" : "draft",
    });
  }
  return rows;
}

async function sha256Json(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function mapCloudSessionLog(
  campaignId: string,
  sessionLog: SessionLogState,
): Promise<CloudSessionLogRow[]> {
  assertCampaignId(campaignId);
  const turns = sessionLog.entries.filter((entry): entry is GameTurnEntry => entry.entryType === "GAME_TURN");
  const turnNumbers = turns.map((entry) => entry.turnNumber).sort((a, b) => a - b);
  if (turnNumbers.length !== sessionLog.lastTurnNumber ||
      turnNumbers.some((turn, index) => turn !== index + 1)) {
    throw new CloudMappingError("Session log turn numbers are not a complete append-only sequence.");
  }
  const rows: CloudSessionLogRow[] = [];
  for (const entry of turns) {
    const occurredAt = parseIsoTimestamp(entry.committedAt);
    if (!occurredAt) throw new CloudMappingError("Game turn " + entry.turnNumber + " has an invalid committed timestamp.");
    const stateDelta = entry as unknown as Record<string, unknown>;
    rows.push({
      id: await deterministicCloudId(campaignId, "session_log", entry.id),
      campaign_id: campaignId,
      turn_number: entry.turnNumber,
      occurred_at: occurredAt,
      player_action: entry.playerIntent,
      gm_resolution: entry.gmNarration ?? entry.worldOutcome,
      state_delta: stateDelta,
      source_draft_id: null,
      payload_sha256: await sha256Json(stateDelta),
    });
  }
  return rows;
}

export async function mapCloudAuditLog(
  campaignId: string,
  auditLog: AuditLogState,
  sessionLog: SessionLogState,
): Promise<CloudAuditLogRow[]> {
  assertCampaignId(campaignId);
  const rows: CloudAuditLogRow[] = [];
  for (const entry of auditLog.entries) {
    const createdAt = parseIsoTimestamp(entry.timestamp);
    if (!createdAt) throw new CloudMappingError("Audit entry " + entry.id + " has an invalid timestamp.");
    rows.push({
      id: await deterministicCloudId(campaignId, "audit_log", entry.id),
      campaign_id: campaignId,
      action: entry.action,
      entity_type: "campaign",
      entity_id: null,
      details: {
        local_id: entry.id,
        status: entry.status,
        details: entry.details,
        campaign_version: entry.campaignVersion,
        character_version: entry.characterVersion,
        turn_number: entry.turnNumber,
        checksum_snapshot: entry.checksumSnapshot,
      },
      created_at: createdAt,
    });
  }
  for (const entry of sessionLog.entries) {
    if (entry.entryType !== "TECHNICAL_NOTE") continue;
    const createdAt = parseIsoTimestamp(entry.recordedAt);
    if (!createdAt) throw new CloudMappingError("Technical note " + entry.id + " has an invalid timestamp.");
    rows.push({
      id: await deterministicCloudId(campaignId, "audit_log", "TECHNICAL_NOTE:" + entry.id),
      campaign_id: campaignId,
      action: "TECHNICAL_NOTE_ADDED",
      entity_type: "session_log_note",
      entity_id: null,
      details: {
        local_id: entry.id,
        entry_type: entry.entryType,
        text: entry.text,
        in_game_date_snapshot: entry.inGameDateSnapshot,
        advances_time: false,
      },
      created_at: createdAt,
    });
  }
  return rows;
}

export async function mapCloudCampaignCollections(
  campaignId: string,
  collections: ObsidianCollections,
  now = new Date().toISOString(),
): Promise<CloudCampaignStateMapping> {
  assertCampaignId(campaignId);
  const sourceMap = await mapCloudSources(campaignId, collections.sources);
  const locationMap = await mapCloudLocations(campaignId, collections.locations, sourceMap.ids);
  const factionMap = await mapCloudFactions(campaignId, collections.factions, sourceMap.ids);
  const npcMap = await mapCloudNpcs(campaignId, collections.npcs, sourceMap.ids, locationMap.ids, factionMap.ids);

  const setup = collections.world_state.setup;
  const requiredSourceTypes = ["master_rules", "world_canon", "player_character"];
  const verifiedRequiredSources = requiredSourceTypes.every((sourceType) =>
    sourceMap.rows.some((row) => row.source_type === sourceType && row.content_status === "verified")
  );
  const verifiedAt = setup.confirmed && setup.characterConfirmed && verifiedRequiredSources
    ? (parseIsoTimestamp(setup.confirmedAt ?? "") ?? parseIsoTimestamp(now))
    : null;
  const playerCharacter = await mapCloudPlayerCharacter(
    campaignId,
    collections.player_character_state,
    sourceMap.ids,
    verifiedAt,
  );
  const currentLocationId = collections.world_state.currentLocationId
    ? locationMap.ids[collections.world_state.currentLocationId] ?? null
    : null;
  if (collections.world_state.currentLocationId && !currentLocationId) {
    throw new CloudMappingError("Current campaign location is missing from the location collection.");
  }

  const sessionLog = await mapCloudSessionLog(campaignId, collections.session_log);
  const lastTurn = collections.session_log.lastTurnNumber;
  const activeDrafts = await mapCloudTurnDrafts(
    campaignId,
    collections.turn_drafts,
    sourceMap.ids,
    locationMap.ids,
    lastTurn + 1,
  );
  const auditLog = await mapCloudAuditLog(campaignId, collections.audit_log, collections.session_log);
  const facts = await mapCloudCanonFacts(campaignId, collections.canon_facts, sourceMap.ids);
  const timelineEvents = await mapCloudTimelineEvents(campaignId, collections.timeline_events, sourceMap.ids);

  const setupConfirmed = setup.confirmed && setup.sourcesConfirmed && setup.parametersConfirmed &&
    setup.startPointConfirmed && setup.characterConfirmed && setup.noAutoImportAcknowledged;
  const campaignActive = setupConfirmed && verifiedAt !== null && verifiedRequiredSources && currentLocationId !== null;
  return {
    campaign: {
      title: collections.world_state.campaignName,
      status: campaignActive ? "active" : setup.confirmed ? "ready" : "preparation",
      campaign_date: parseIsoTimestamp(setup.confirmedAt ?? "") ?? parseIsoTimestamp(now) ?? new Date().toISOString(),
      current_location_id: currentLocationId,
      last_confirmed_turn: lastTurn,
      settings: mapCloudCampaignSettings(collections.world_state),
    },
    sources: sourceMap.rows,
    world_state: mapCloudWorldState(campaignId, collections.world_state),
    player_character_state: playerCharacter,
    npcs: npcMap.npcs,
    npc_knowledge: npcMap.knowledge,
    factions: factionMap.rows,
    locations: locationMap.rows,
    timeline_events: timelineEvents,
    canon_facts: facts,
    turn_drafts: activeDrafts,
    session_log: sessionLog,
    audit_log: auditLog,
  };
}
