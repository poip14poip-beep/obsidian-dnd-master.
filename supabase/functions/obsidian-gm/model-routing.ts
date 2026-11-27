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


/**
 * Validate game-turn invariants before returning model output to the client.
 * JSON-schema validity alone is insufficient: a model can return a numeric
 * dice result that is structurally valid but violates the player-roll protocol.
 */
export function validateGameTurnSemantics(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "game turn must be an object";
  }
  const turn = value as Record<string, unknown>;
  if (!Array.isArray(turn.rolls)) return "rolls must be an array";
  if (turn.rolls.length > 1) return "only one player roll may be pending at a time";
  for (const roll of turn.rolls) {
    if (!roll || typeof roll !== "object" || Array.isArray(roll)) {
      return "roll entry must be an object";
    }
    const item = roll as Record<string, unknown>;
    if (typeof item.label !== "string" || !item.label.trim() ||
        typeof item.formula !== "string" || !item.formula.trim()) {
      return "pending player roll requires a label and formula";
    }
    if (item.result !== "ОЖИДАЕТСЯ БРОСОК ИГРОКА") {
      return "model attempted to supply a dice result; only the player/application may roll";
    }
  }
  if (turn.rolls.length === 0) return null;

  const changes = turn.characterChanges && typeof turn.characterChanges === "object" && !Array.isArray(turn.characterChanges)
    ? turn.characterChanges as Record<string, unknown> : {};
  const currency = changes.currencyDelta && typeof changes.currencyDelta === "object" && !Array.isArray(changes.currencyDelta)
    ? changes.currencyDelta as Record<string, unknown> : {};
  const hasArrayChanges = ["inventory", "resources", "conditions"].some((key) =>
    Array.isArray(changes[key]) && (changes[key] as unknown[]).length > 0
  );
  const hasCurrencyChanges = Object.values(currency).some((amount) =>
    typeof amount === "number" && amount !== 0
  );
  const hasNpcChanges = Array.isArray(turn.npcChanges) && turn.npcChanges.length > 0;
  const hasQuestChanges = Array.isArray(turn.questChanges) && turn.questChanges.length > 0;
  const hasConsequence = typeof turn.consequenceText === "string" && turn.consequenceText.trim().length > 0;
  if (turn.timeDeltaMinutes !== 0 || turn.hpDelta !== 0 || hasArrayChanges ||
      hasCurrencyChanges || hasNpcChanges || hasQuestChanges ||
      turn.newLocationId !== null || hasConsequence) {
    return "a pending player roll must not mutate campaign or character state";
  }
  return null;
}
