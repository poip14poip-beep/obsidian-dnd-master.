import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_GAME_TURN_REASONING_EFFORT,
  GAME_TURN_MAX_OUTPUT_TOKENS,
  gameTurnAttemptTimeoutMs,
  selectGameMasterModelOrder,
  validateGameTurnSemantics,
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
    narration: "Персонаж замечает движение.",
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
    rolls: [{ label: "Мудрость (Восприятие)", formula: "1d20 + 3", result: "ОЖИДАЕТСЯ БРОСОК ИГРОКА" }],
  };

  it("accepts a pending roll without resolving its outcome", () => {
    expect(validateGameTurnSemantics(pending)).toBeNull();
  });

  it("rejects a model-invented numeric dice result", () => {
    expect(validateGameTurnSemantics({
      ...pending,
      rolls: [{ ...pending.rolls[0], result: "17" }],
    })).toContain("only the player/application may roll");
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

  it("allows an ordinary turn with no pending roll", () => {
    expect(validateGameTurnSemantics({
      ...pending,
      rolls: [],
      timeDeltaMinutes: 5,
    })).toBeNull();
  });
});
