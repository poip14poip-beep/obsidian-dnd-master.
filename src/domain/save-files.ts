import type { ObsidianCollections } from "./types";

function jsonBlock(value: unknown): string {
  return ```json
${JSON.stringify(value, null, 2)}
```;
}
export function buildCampaignStateMarkdown(collections: ObsidianCollections, generatedAt = new Date().toISOString()): string {
  const { world_state, sources, canon_facts, npcs, factions, locations, timeline_events, audit_log } = collections;
  return [
    "# CAMPAIGN_STATE",
    "",
    `Generated: ${generatedAt}`,
    `Campaign: ${world_state.campaignName || "UNKNOWN"}`,
    `Current in-game date: ${world_state.currentInGameDate}`,
    `Current location ID: ${world_state.currentLocationId ?? "UNKNOWN"}`,
    "",
    "## World state (PLAYER_CHARACTER_STATE deliberately excluded)",
    jsonBlock(world_state),
    "",
    "## Source registry",
    jsonBlock(sources.map(({ id, title, type, targetPartition, contentStatus, checksum, fileName }) =>
      ({ id, title, type, targetPartition, contentStatus, checksum, fileName }))),
    "",
    "## Canon facts",
    jsonBlock(canon_facts),
    "",
    "## NPCs and knowledge",
    jsonBlock(npcs),
    "",
    "## Factions",
    jsonBlock(factions),
    "",
    "## Locations and routes",
    jsonBlock({ locations, routes: world_state.routes }),
    "",
    "## Timeline events",
    jsonBlock(timeline_events),
    "",
    "## Audit log",
    jsonBlock(audit_log),
    "",
  ].join("\n");
}
export function buildPlayerCharacterStateMarkdown(collections: ObsidianCollections, generatedAt = new Date().toISOString()): string {
  return [
    "# PLAYER_CHARACTER_STATE",
    "",
    `Generated: ${generatedAt}`,
    "This file contains player-character data only; it is not world canon.",
    "",
    jsonBlock(collections.player_character_state),
    "",
  ].join("\n");
}
export function buildSessionLogMarkdown(collections: ObsidianCollections): string {
  const entries = collections.session_log.entries.map((entry) => {
    if (entry.entryType === "TECHNICAL_NOTE") {
      return `## OOC / TECHNICAL NOTE — ${entry.recordedAt}\n\nIn-game date snapshot: ${entry.inGameDateSnapshot}\n\n${entry.text}\n\nDoes not advance game time or turn number.`;
    }
    return [
      `## TURN #${String(entry.turnNumber).padStart(4, "0")} — ${entry.committedAt}`,
      `Date: ${entry.inGameDateBefore} → ${entry.inGameDateAfter}`,
      `Time delta: ${entry.timeDeltaMinutes} minutes`,
      `Player action: ${entry.playerIntent}`,
      `Summary: ${entry.summary}`,
      `World outcome: ${entry.worldOutcome}`,
      entry.gmNarration ? `GM narration:\n\n${entry.gmNarration}` : "",
      `HP delta: ${entry.hpDelta}`,
      `Rolls: ${JSON.stringify(entry.rolls)}`,
      `Checksum: ${entry.entryChecksum}`,
    ].filter(Boolean).join("\n\n");
  });
  return ["# SESSION_LOG", "", `Last confirmed game turn: ${collections.session_log.lastTurnNumber}`, "", ...entries, ""].join("\n");
}
