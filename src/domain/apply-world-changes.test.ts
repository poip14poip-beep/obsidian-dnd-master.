import { describe, expect, it } from "vitest";
import { createInitialCollections } from "./defaults";
import { applyWorldChangeSet } from "./apply-world-changes";
import type { WorldChangeSet } from "./types";

const empty: WorldChangeSet = {
  facts: [], npcUpdates: [], npcKnowledgeAdditions: [], newLocations: [], newNpcs: [],
  factionUpdates: [], newFactions: [], delayedEvents: [],
};
describe("world change application", () => {
  it("adds one canon location, connects a route, moves the player, and resolves a new NPC reference", () => {
    const c = createInitialCollections();
    const result = applyWorldChangeSet({
      changes: {
        ...empty,
        newLocations: [{ tempId: "loc-new", name: "Старый мост", region: "UNKNOWN", description: "Каменный мост", certainty: "KNOWN", sourceId: "MANUAL_GM_ENTRY", distanceFromCurrent: "2 мили", travelTimeHours: 1, routeCertainty: "APPROXIMATE", routeNotes: "Пешком вдоль реки" }],
        newNpcs: [{ tempId: "npc-new", name: "Страж", role: "Сторож моста", locationId: "loc-new", factionId: null, goals: "Охраняет проход", attitudeToPlayer: "Настороженное", certainty: "KNOWN" }],
        facts: [{ title: "Страж заметил персонажа", statement: "Страж видел приближение персонажа", rationale: "Непосредственное наблюдение", layer: "OBJECTIVE_TRUTH", subjectNpcId: "npc-new", certainty: "KNOWN", scope: "LOCATION" }],
      },
      currentLocationId: "origin", inGameDate: "День 1", turnNumber: 1,
      locations: c.locations, npcs: c.npcs, factions: c.factions, now: "2026-11-25T00:00:00Z",
      makeId: (prefix) => prefix + "-test",
    });
    expect(result.locations.some((l) => l.name === "Старый мост")).toBe(true);
    expect(result.routes[0]).toMatchObject({ fromLocationId: "origin", distanceLabel: "2 мили" });
    expect(result.currentLocationId).toBe("origin");
    expect(result.npcs.find((n) => n.name === "Страж")?.locationId).toBe("loc-test");
    expect(result.canonFacts[0]?.subjectNpcId).toBe("npc-test");
  });
  it("records NPC knowledge with acquisition path and appends entity history on faction update", () => {
    const c = createInitialCollections();
    const faction = { id: "f1", name: "Орден", goals: "Старые цели", resources: "10 стражников", standing: "Нейтральный", certainty: "KNOWN" as const, sourceId: "MANUAL_GM_ENTRY", locked: true, version: 1, history: [] };
    const npc = { id: "n1", name: "Свидетель", role: "Торговец", locationId: null, factionId: "f1", goals: "Продать товары", attitudeToPlayer: "Нейтральный", certainty: "KNOWN" as const, sourceId: "MANUAL_GM_ENTRY", locked: true, knowledge: [], version: 1, history: [] };
    const result = applyWorldChangeSet({
      changes: { ...empty, factionUpdates: [{ factionId: "f1", goals: "Найти пропавшего", resources: null, standing: null, certainty: null, reason: "Потеряли караван" }],
        npcKnowledgeAdditions: [{ npcId: "n1", factSummary: "Караван пропал", sourceId: "MANUAL_GM_ENTRY", acquisitionPath: "Услышал приказ глашатая", certainty: "KNOWN" }] },
      currentLocationId: null, inGameDate: "День 2", turnNumber: 2,
      locations: [], npcs: [npc], factions: [faction], now: "2026-11-25T01:00:00Z", makeId: (prefix) => prefix + "-test",
    });
    expect(result.factions[0]?.goals).toBe("Найти пропавшего");
    expect(result.factions[0]?.history).toHaveLength(1);
    expect(result.npcs[0]?.knowledge[0]).toMatchObject({ factSummary: "Караван пропал", acquisitionPath: "Услышал приказ глашатая" });
  });
});
