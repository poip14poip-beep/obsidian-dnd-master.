import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_GAME_TURN_REASONING_EFFORT,
  GAME_TURN_MAX_OUTPUT_TOKENS,
  gameTurnAttemptTimeoutMs,
  selectGameMasterModelOrder,
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
