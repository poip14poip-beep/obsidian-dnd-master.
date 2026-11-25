import type {
  CanonFact, DelayedEvent, EntityRevision, FactionRecord, LocationRecord, NpcKnowledgeEntry,
  NpcRecord, TravelRoute, WorldChangeSet,
} from "./types";

export interface WorldChangeApplicationInput {
  changes: WorldChangeSet;
  currentLocationId: string | null;
  selectedLocationId: string | null;
  selectedLocationKey: string | null;
  inGameDate: string;
  turnNumber: number;
  locations: LocationRecord[];
  npcs: NpcRecord[];
  factions: FactionRecord[];
  now: string;
  makeId: (prefix: string) => string;
}
export interface WorldChangeApplicationResult {
  locations: LocationRecord[];
  routes: TravelRoute[];
  npcs: NpcRecord[];
  factions: FactionRecord[];
  canonFacts: CanonFact[];
  timelineEvents: DelayedEvent[];
  currentLocationId: string | null;
  counts: Record<string, number>;
}
const emptyCounts = () => ({
  facts: 0, npcUpdates: 0, npcKnowledge: 0, newNpcs: 0, newLocations: 0,
  factionUpdates: 0, newFactions: 0, delayedEvents: 0, routes: 0,
});

/** Applies one reviewed world delta atomically in-memory. Persistence is handled by the store transaction. */
export function applyWorldChangeSet(input: WorldChangeApplicationInput): WorldChangeApplicationResult {
  const { changes, inGameDate, turnNumber, now, makeId } = input;
  const counts = emptyCounts();
  const locationIds = new Map<string, string>();
  const npcIds = new Map<string, string>();
  const factionIds = new Map<string, string>();
  const locations = [...input.locations];
  const routes: TravelRoute[] = [];
  const factions = [...input.factions];
  const npcs = [...input.npcs];
  const canonFacts: CanonFact[] = [];
  const timelineEvents: DelayedEvent[] = [];

  for (const proposal of changes.newLocations) {
    if (locationIds.has(proposal.tempId)) throw new Error(`Повторяется временный ID локации ${proposal.tempId}.`);
    const id = makeId("loc");
    locationIds.set(proposal.tempId, id);
    locations.push({
      id, name: proposal.name, region: proposal.region, description: proposal.description,
      certainty: proposal.certainty, sourceId: proposal.sourceId,
    });
    counts.newLocations += 1;
    const distanceKnown = proposal.distanceFromCurrent.trim() && proposal.distanceFromCurrent !== "UNKNOWN";
    const travelTimeKnown = proposal.travelTimeHours !== null;
    if (input.currentLocationId && (distanceKnown || travelTimeKnown)) {
      routes.push({
        id: makeId("route"), fromLocationId: input.currentLocationId, toLocationId: id,
        distanceLabel: proposal.distanceFromCurrent || "UNKNOWN", travelTimeHours: proposal.travelTimeHours,
        certainty: proposal.routeCertainty, notes: proposal.routeNotes,
      });
      counts.routes += 1;
    }
  }

  for (const proposal of changes.newFactions) {
    if (factionIds.has(proposal.tempId)) throw new Error(`Повторяется временный ID фракции ${proposal.tempId}.`);
    const id = makeId("fac");
    factionIds.set(proposal.tempId, id);
    factions.push({
      id, name: proposal.name, goals: proposal.goals, resources: proposal.resources, standing: proposal.standing,
      certainty: proposal.certainty, sourceId: "MANUAL_GM_ENTRY", locked: true, version: 1, history: [],
    });
    counts.newFactions += 1;
  }

  const resolveLocation = (id: string | null): string | null =>
    id === null ? null : locationIds.get(id) ?? id;
  const resolveFaction = (id: string | null): string | null =>
    id === null ? null : factionIds.get(id) ?? id;
  const resolveNpc = (id: string): string => npcIds.get(id) ?? id;

  for (const proposal of changes.newNpcs) {
    if (npcIds.has(proposal.tempId)) throw new Error(`Повторяется временный ID NPC ${proposal.tempId}.`);
    const id = makeId("npc");
    npcIds.set(proposal.tempId, id);
    npcs.push({
      id, name: proposal.name, role: proposal.role,
      locationId: resolveLocation(proposal.locationId), factionId: resolveFaction(proposal.factionId),
      goals: proposal.goals, attitudeToPlayer: proposal.attitudeToPlayer, certainty: proposal.certainty,
      sourceId: "MANUAL_GM_ENTRY", locked: true, knowledge: [], version: 1, history: [],
    });
    counts.newNpcs += 1;
  }

  for (const change of changes.facts) {
    const id = makeId("fact");
    canonFacts.push({
      id, title: change.title, statement: change.statement, rationale: change.rationale,
      layer: change.layer, subjectNpcId: change.subjectNpcId ? resolveNpc(change.subjectNpcId) : null,
      certainty: change.certainty, sourceId: "MANUAL_GM_ENTRY",
      acquisitionPath: `Результат взаимодействия в ходе №${turnNumber}`,
      inGameDate, scope: change.scope, locked: true, createdAt: now, version: 1, history: [],
    });
    counts.facts += 1;
  }

  for (const update of changes.npcUpdates) {
    const index = npcs.findIndex((npc) => npc.id === resolveNpc(update.npcId));
    if (index < 0) throw new Error(`NPC ${update.npcId} для обновления не найден.`);
    const old = npcs[index]!;
    if (old.locked && !update.reason.trim()) throw new Error(`Для изменения NPC «${old.name}» требуется причина.`);
    const revision: EntityRevision = {
      version: old.version, changedAt: now, inGameDate,
      summary: `Локация: ${old.locationId ?? "UNKNOWN"}; цели: ${old.goals}; отношение: ${old.attitudeToPlayer}`,
      reason: update.reason,
    };
    npcs[index] = {
      ...old,
      role: update.role ?? old.role,
      locationId: update.locationId === null ? old.locationId : resolveLocation(update.locationId),
      factionId: update.factionId === null ? old.factionId : resolveFaction(update.factionId),
      goals: update.goals ?? old.goals,
      attitudeToPlayer: update.attitudeToPlayer ?? old.attitudeToPlayer,
      certainty: update.certainty ?? old.certainty,
      version: old.version + 1, history: [...old.history, revision],
    };
    counts.npcUpdates += 1;
  }

  for (const update of changes.factionUpdates) {
    const index = factions.findIndex((faction) => faction.id === update.factionId);
    if (index < 0) throw new Error(`Фракция ${update.factionId} для обновления не найдена.`);
    const old = factions[index]!;
    if (old.locked && !update.reason.trim()) throw new Error(`Для изменения фракции «${old.name}» требуется причина.`);
    const revision: EntityRevision = {
      version: old.version, changedAt: now, inGameDate,
      summary: `Цели: ${old.goals}; ресурсы: ${old.resources}; положение: ${old.standing}`,
      reason: update.reason,
    };
    factions[index] = {
      ...old, goals: update.goals ?? old.goals, resources: update.resources ?? old.resources,
      standing: update.standing ?? old.standing, certainty: update.certainty ?? old.certainty,
      version: old.version + 1, history: [...old.history, revision],
    };
    counts.factionUpdates += 1;
  }

  for (const knowledge of changes.npcKnowledgeAdditions) {
    const npcId = resolveNpc(knowledge.npcId);
    const index = npcs.findIndex((npc) => npc.id === npcId);
    if (index < 0) throw new Error(`NPC ${knowledge.npcId} для добавления знания не найден.`);
    const entry: NpcKnowledgeEntry = {
      id: makeId("knw"), factSummary: knowledge.factSummary, sourceId: knowledge.sourceId,
      acquisitionPath: knowledge.acquisitionPath, inGameDate, certainty: knowledge.certainty, recordedAt: now,
    };
    const npc = npcs[index]!;
    npcs[index] = { ...npc, knowledge: [entry, ...npc.knowledge] };
    counts.npcKnowledge += 1;
  }

  for (const event of changes.delayedEvents) {
    timelineEvents.push({
      id: makeId("evt"), title: event.title, triggerInGameDate: event.triggerInGameDate,
      consequence: event.consequence, status: event.status, certainty: event.certainty,
      sourceId: "MANUAL_GM_ENTRY",
    });
    counts.delayedEvents += 1;
  }

  const resolvedSelectedLocation = input.selectedLocationId ?? (input.selectedLocationKey ? locationIds.get(input.selectedLocationKey) : null);
  if (input.selectedLocationKey && !resolvedSelectedLocation) {
    throw new Error(`Новая выбранная локация «${input.selectedLocationKey}» не была создана этим ходом.`);
  }
  if (resolvedSelectedLocation && !locations.some((location) => location.id === resolvedSelectedLocation)) {
    throw new Error(`Выбранная локация ${resolvedSelectedLocation} отсутствует в реестре.`);
  }
  const selectedLocationId = resolvedSelectedLocation ?? input.currentLocationId;
  return {
    locations, routes, npcs, factions, canonFacts, timelineEvents,
    currentLocationId: selectedLocationId, counts,
  };
}
