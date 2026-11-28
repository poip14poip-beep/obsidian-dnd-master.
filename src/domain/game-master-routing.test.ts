import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_GAME_TURN_REASONING_EFFORT,
  GAME_TURN_MAX_OUTPUT_TOKENS,
  gameTurnAttemptTimeoutMs,
  selectGameMasterModelOrder,
  measureGameTurnInput,
  selectRuleExcerpts,
  selectCanonExcerpts,
  validateGameTurnSemantics,
  validatePendingRollNarration,
  type ModelRoutingFlags,
} from "../../supabase/functions/obsidian-gm/model-routing";

const normalTurn: ModelRoutingFlags = {
  isCompatibilityRequest: false,
  isStoryRequest: false,
  isIdentityRequest: false,
  isBiographyRequest: false,
  highImpactTurn: false,
  isGameTurnRequest: true,
};

describe("Obsidian GM model routing", () => {
  it("uses a second provider when a normal game-turn response is truncated or invalid", () => {
    expect(selectGameMasterModelOrder(normalTurn)).toEqual([
      "deepseek/deepseek-v4.1-flash",
      "google/gemini-4-argon",
    ]);
  });

  it("keeps a separate high-impact route with an independent fallback", () => {
    expect(selectGameMasterModelOrder({ ...normalTurn, highImpactTurn: true })).toEqual([
      "anthropic/claude-sonnet-5.5",
      "google/gemini-4-argon",
    ]);
  });

  it("preserves the dedicated story and compatibility routes", () => {
    expect(selectGameMasterModelOrder({ ...normalTurn, isGameTurnRequest: false, isStoryRequest: true }))
      .toEqual(["deepseek/deepseek-v4.1-flash", "google/gemini-4-argon"]);
    expect(selectGameMasterModelOrder({ ...normalTurn, isGameTurnRequest: false, isCompatibilityRequest: true }))
      .toEqual(["deepseek/deepseek-v4.1-flash", "anthropic/claude-sonnet-5.5"]);
  });

  it("does not add extra providers to identity and biography generation", () => {
    expect(selectGameMasterModelOrder({ ...normalTurn, isGameTurnRequest: false, isIdentityRequest: true }))
      .toEqual(["deepseek/deepseek-v4.1-flash"]);
    expect(selectGameMasterModelOrder({ ...normalTurn, isGameTurnRequest: false, isBiographyRequest: true }))
      .toEqual(["deepseek/deepseek-v4.1-flash"]);
  });

  it("gives game JSON enough output tokens without spending them on hidden reasoning", () => {
    expect(GAME_TURN_MAX_OUTPUT_TOKENS).toBe(8192);
    expect(DEEPSEEK_GAME_TURN_REASONING_EFFORT).toBe("none");
  });

  it("bounds the two game-turn provider attempts to the mobile request window", () => {
    expect(gameTurnAttemptTimeoutMs(0)).toBe(42_000);
    expect(gameTurnAttemptTimeoutMs(1)).toBe(28_000);
    expect(gameTurnAttemptTimeoutMs(2)).toBe(28_000);
  });
});


describe("game-turn semantic validation", () => {
  const pending = {
    narration: "Персонаж прислушивается к окружающим звукам.",
    timeDeltaMinutes: 0,
    hpDelta: 0,
    newLocationId: null,
    consequenceText: "",
    needsClarification: false,
    questChanges: [],
    npcChanges: [],
    characterChanges: {
      inventory: [], resources: [], conditions: [],
      currencyDelta: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    },
    rolls: [{ roller: "PLAYER", label: "Мудрость (Восприятие)", formula: "1d20 + 3", dc: 15, targetType: "DC", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА" }],
  };

  it("accepts a pending roll without resolving its outcome", () => {
    expect(validateGameTurnSemantics(pending)).toBeNull();
  });

  it("rejects a model-invented numeric dice result", () => {
    expect(validateGameTurnSemantics({
      ...pending,
      rolls: [{ ...pending.rolls[0], result: "17" }],
    })).toContain("only the authenticated server may roll");
  });

  it("rejects multiple simultaneous pending rolls", () => {
    expect(validateGameTurnSemantics({
      ...pending,
      rolls: [...pending.rolls, ...pending.rolls],
    })).toContain("only one player roll");
  });

  it("rejects state changes while waiting for the player roll", () => {
    expect(validateGameTurnSemantics({
      ...pending,
      characterChanges: {
        ...pending.characterChanges,
        inventory: [{ action: "ADD", name: "Ключ", quantity: 1 }],
      },
    })).toContain("must not mutate");
  });

  it("rejects campaign memory and world outcomes while a roll is pending", () => {
    expect(validateGameTurnSemantics({ ...pending, worldOutcome: "Дверь открылась." })).toContain("must not mutate");
    expect(validateGameTurnSemantics({ ...pending, campaignMemory: "Персонаж узнал тайну." })).toContain("must not mutate");
    expect(validateGameTurnSemantics({ ...pending, stateNotes: ["NPC увидел игрока"] })).toContain("must not mutate");
  });

  it("allows an ordinary turn with no pending roll", () => {
    expect(validateGameTurnSemantics({
      ...pending,
      rolls: [],
      timeDeltaMinutes: 5,
    })).toBeNull();
  });

describe("engine-boundary narration guard", () => {
  const pendingRoll = {
    rolls: [{ roller: "PLAYER", label: "Сила", formula: "1d20+2", dc: 15, targetType: "DC", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА" }],
  };

  it("rejects narration that resolves success before the player rolls", () => {
    expect(validatePendingRollNarration({
      ...pendingRoll,
      narration: "Ты успешно открываешь запертую дверь.",
    })).toContain("before its pending roll");
  });

  it("rejects narration that resolves failure before the player rolls", () => {
    expect(validatePendingRollNarration({
      ...pendingRoll,
      narration: "Тебе не удалось взломать замок.",
    })).toContain("before its pending roll");
  });

  it("allows framing the attempt without stating its outcome", () => {
    expect(validatePendingRollNarration({
      ...pendingRoll,
      narration: "Ты опускаешься на колено и осторожно подносишь отмычку к замку.",
    })).toBeNull();
  });

  it("does not constrain narration when no roll is pending", () => {
    expect(validatePendingRollNarration({
      narration: "Ты успешно открываешь дверь.",
      rolls: [],
    })).toBeNull();
  });
});

});


describe("bounded source-attributed SRD retrieval", () => {
  it("returns whole relevant paragraphs with original line ranges", () => {
    const source = [
      "# Combat",
      "",
      "The Attack action lets you make one attack roll.",
      "",
      "## Unrelated",
      "This paragraph discusses weather and travel.",
      "",
      "## Ability Checks",
      "An ability check uses a d20 test and the relevant modifier.",
    ].join("\n");
    const result = selectRuleExcerpts(source, ["attack", "ability check"], 10_000, 12);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ startLine: 8, endLine: 9 });
    expect(result[0]?.text).toContain("An ability check uses a d20 test");
    expect(result[1]).toMatchObject({ startLine: 3, endLine: 3 });
    expect(result[1]?.text).toBe("The Attack action lets you make one attack roll.");
  });

  it("skips a paragraph that cannot fit whole and continues to a smaller relevant rule", () => {
    const source = [
      "## Oversized",
      "attack " + "detail ".repeat(100),
      "",
      "## Compact",
      "The Attack action is available.",
    ].join("\n");
    const result = selectRuleExcerpts(source, ["attack"], 300, 4);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe("## Compact\nThe Attack action is available.");
  });

  it("returns no unverified matches for an empty or unrelated query", () => {
    expect(selectRuleExcerpts("A complete SRD paragraph.", [], 1000, 4)).toEqual([]);
    expect(selectRuleExcerpts("A complete SRD paragraph.", ["grapple"], 1000, 4)).toEqual([]);
  });
});


describe("bounded source-attributed canon retrieval", () => {
  it("keeps section IDs, heading paths and original line ranges for at most twelve whole paragraphs", () => {
    const content = Array.from({ length: 30 }, (_, index) => [
      `## Region ${index + 1}`,
      "",
      `Эйргард — подтверждённый регион Экдрасиля. Полный канонический фрагмент ${index + 1}.`,
      "",
    ].join("\n")).join("\n");
    const result = selectCanonExcerpts(content, ["Эйргард"], 12_000, 12);
    expect(result).toHaveLength(12);
    expect(result[0]).toMatchObject({
      startLine: 3,
      sectionId: "EKDRASIL_WORLD_BIBLE:1:region-1",
      headingPath: ["Region 1"],
    });
    expect(result[11]?.sectionId).toBe("EKDRASIL_WORLD_BIBLE:45:region-12");
  });

  it("skips an oversized canon paragraph whole and keeps a smaller complete section", () => {
    const content = [
      "## Oversized region",
      "",
      "Эйргард — " + "подтверждённая подробность ".repeat(300),
      "",
      "## Compact region",
      "",
      "Эйргард — короткий, целый и подтверждённый фрагмент канона без сокращений и потери исходного смысла.",
    ].join("\n");
    const result = selectCanonExcerpts(content, ["Эйргард"], 500, 4);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toContain("короткий, целый");
    expect(result[0]?.sectionId).toContain("compact-region");
  });

  it("does not fabricate a canon match for unrelated terms", () => {
    expect(selectCanonExcerpts("## Эйргард\n\nПодтверждённый текст канона.", ["несуществующий термин"], 1000, 4)).toEqual([]);
  });
});


describe("game-turn payload metrics", () => {
  it("measures payload component sizes and collection counts without copying content", () => {
    const metrics = measureGameTurnInput({
      campaign: { campaignName: "Test" },
      playerCharacterState: { name: "Hero" },
      playerDossier: "verified dossier",
      npcSimulationReference: "GM-only rules",
      canonFacts: [{ id: "fact-1" }],
      knownNpcs: [{ id: "npc-1" }, { id: "npc-2" }],
      knownFactions: [{ id: "faction-1" }],
      knownLocations: [],
      scheduledAndDelayedEvents: [{ id: "event-1" }],
      fullCampaignChronicle: [{ turnNumber: 1 }, { turnNumber: 2 }],
      recentJournal: [{ turnNumber: 2 }],
    });
    expect(metrics.campaignChars).toBeGreaterThan(0);
    expect(metrics.characterChars).toBeGreaterThan(0);
    expect(metrics.dossierChars).toBe(JSON.stringify("verified dossier").length);
    expect(metrics.npcSimulationChars).toBe(JSON.stringify("GM-only rules").length);
    expect(metrics.canonFacts).toBe(1);
    expect(metrics.npcCount).toBe(2);
    expect(metrics.factionCount).toBe(1);
    expect(metrics.locationCount).toBe(0);
    expect(metrics.scheduledEventCount).toBe(1);
    expect(metrics.fullChronicleEntries).toBe(2);
    expect(metrics.recentJournalEntries).toBe(1);
  });

  it("returns zeroed metrics for invalid payloads", () => {
    expect(measureGameTurnInput(null).npcSimulationChars).toBe(0);
    expect(measureGameTurnInput([]).npcCount).toBe(0);
  });
});
