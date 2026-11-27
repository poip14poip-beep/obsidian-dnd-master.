export type GameMasterModelId =
  | "deepseek/deepseek-v4.1-flash"
  | "anthropic/claude-sonnet-5.5"
  | "google/gemini-4-argon";

export interface ModelRoutingFlags {
  isCompatibilityRequest: boolean;
  isStoryRequest: boolean;
  isIdentityRequest: boolean;
  isBiographyRequest: boolean;
  highImpactTurn: boolean;
  isGameTurnRequest: boolean;
}

/**
 * Provider order is a reliability policy, not multi-agent orchestration:
 * a second provider is used only when the first returns an error, truncation,
 * invalid JSON, or a schema-invalid result.
 */
export function selectGameMasterModelOrder(flags: ModelRoutingFlags): GameMasterModelId[] {
  if (flags.isCompatibilityRequest) {
    return ["deepseek/deepseek-v4.1-flash", "anthropic/claude-sonnet-5.5"];
  }
  if (flags.isStoryRequest) {
    return ["deepseek/deepseek-v4.1-flash", "google/gemini-4-argon"];
  }
  if (flags.isIdentityRequest || flags.isBiographyRequest) {
    return ["deepseek/deepseek-v4.1-flash"];
  }
  if (flags.highImpactTurn) {
    return ["anthropic/claude-sonnet-5.5", "google/gemini-4-argon"];
  }
  if (flags.isGameTurnRequest) {
    return ["deepseek/deepseek-v4.1-flash", "google/gemini-4-argon"];
  }
  return [
    "deepseek/deepseek-v4.1-flash",
    "anthropic/claude-sonnet-5.5",
    "google/gemini-4-argon",
  ];
}

export const GAME_TURN_MAX_OUTPUT_TOKENS = 8192;
export const DEEPSEEK_GAME_TURN_REASONING_EFFORT = "none" as const;

export function gameTurnAttemptTimeoutMs(attemptIndex: number): number {
  return attemptIndex <= 0 ? 42_000 : 28_000;
}
