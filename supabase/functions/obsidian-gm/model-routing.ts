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
  if (!Array.isArray(turn["rolls"])) return "rolls must be an array";
  if (turn["rolls"].length > 1) return "only one player roll may be pending at a time";
  for (const roll of turn["rolls"]) {
    if (!roll || typeof roll !== "object" || Array.isArray(roll)) {
      return "roll entry must be an object";
    }
    const item = roll as Record<string, unknown>;
    if (typeof item["label"] !== "string" || !item["label"].trim() ||
        typeof item["formula"] !== "string" || !item["formula"].trim()) {
      return "pending player roll requires a label and formula";
    }
    if (item["result"] !== "ОЖИДАЕТСЯ БРОСОК ИГРОКА") {
      return "model attempted to supply a dice result; only the player/application may roll";
    }
  }
  if (turn["rolls"].length === 0) return null;

  const changes = turn["characterChanges"] && typeof turn["characterChanges"] === "object" && !Array.isArray(turn["characterChanges"])
    ? turn["characterChanges"] as Record<string, unknown> : {};
  const currency = changes["currencyDelta"] && typeof changes["currencyDelta"] === "object" && !Array.isArray(changes["currencyDelta"])
    ? changes["currencyDelta"] as Record<string, unknown> : {};
  const hasArrayChanges = ["inventory", "resources", "conditions"].some((key) =>
    Array.isArray(changes[key]) && (changes[key] as unknown[]).length > 0
  );
  const hasCurrencyChanges = Object.values(currency).some((amount) =>
    typeof amount === "number" && amount !== 0
  );
  const hasNpcChanges = Array.isArray(turn["npcChanges"]) && turn["npcChanges"].length > 0;
  const hasQuestChanges = Array.isArray(turn["questChanges"]) && turn["questChanges"].length > 0;
  const hasConsequence = typeof turn["consequenceText"] === "string" && turn["consequenceText"].trim().length > 0;
  if (turn["timeDeltaMinutes"] !== 0 || turn["hpDelta"] !== 0 || hasArrayChanges ||
      hasCurrencyChanges || hasNpcChanges || hasQuestChanges ||
      turn["newLocationId"] !== null || hasConsequence) {
    return "a pending player roll must not mutate campaign or character state";
  }
  return null;
}


export interface RuleExcerpt {
  text: string;
  startLine: number;
  endLine: number;
  score: number;
}

/**
 * Selects whole, source-attributed SRD paragraphs within a strict character
 * budget. The full SRD remains stored unchanged; this only bounds one request.
 */
export function selectRuleExcerpts(
  content: string,
  terms: string[],
  maxChars: number,
  maxItems: number,
): RuleExcerpt[] {
  if (!content.trim() || !terms.length || maxChars <= 0 || maxItems <= 0) return [];
  const normalizedTerms = [...new Set(terms.map((term) => term.toLocaleLowerCase()).filter((term) => term.length > 3))];
  if (!normalizedTerms.length) return [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const ranked: RuleExcerpt[] = [];
  let current: string[] = [];
  let startLine = 1;
  const flush = (endLine: number) => {
    const text = current.join("\n").trim();
    current = [];
    if (!text) return;
    const lower = text.toLocaleLowerCase();
    const score = normalizedTerms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
    if (score > 0) ranked.push({ text, startLine, endLine, score });
  };
  lines.forEach((line, index) => {
    if (!line.trim()) {
      flush(index);
      startLine = index + 2;
    } else {
      if (current.length === 0) startLine = index + 1;
      current.push(line);
    }
  });
  flush(lines.length);

  ranked.sort((a, b) => b.score - a.score || a.startLine - b.startLine);
  const selected: RuleExcerpt[] = [];
  let remaining = maxChars;
  for (const excerpt of ranked) {
    // Reserve space for the source ID, checksum and line attribution added by the caller.
    const cost = excerpt.text.length + 140;
    if (cost > remaining) continue;
    selected.push(excerpt);
    remaining -= cost;
    if (selected.length >= maxItems || remaining <= 0) break;
  }
  return selected;
}


export interface CanonExcerpt extends RuleExcerpt {
  sectionId: string;
  headingPath: string[];
}

/** Select whole canonical paragraphs and retain their enclosing source section. */
export function selectCanonExcerpts(
  content: string,
  terms: string[],
  maxChars: number,
  maxItems: number,
): CanonExcerpt[] {
  if (!content.trim() || !terms.length || maxChars <= 0 || maxItems <= 0) return [];
  const normalizedTerms = [...new Set(terms.map((term) => term.toLocaleLowerCase()).filter((term) => term.length > 3))];
  if (!normalizedTerms.length) return [];

  const lines = content.replace(/\\r\\n?/g, "\\n").split("\\n");
  const headings: Array<{ level: number; title: string; line: number }> = [];
  const ranked: CanonExcerpt[] = [];
  let current: string[] = [];
  let startLine = 1;
  let currentHeadingPath: string[] = [];
  let currentSectionId = "EKDRASIL_WORLD_BIBLE:UNSECTIONED";

  const flush = (endLine: number) => {
    const text = current.join("\\n").trim();
    current = [];
    if (text.length <= 60) return;
    const lower = text.toLocaleLowerCase();
    const score = normalizedTerms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0) +
      (/^#{1,4}\\s/m.test(text) ? 1 : 0);
    if (score > 0) ranked.push({
      text, startLine, endLine, score,
      sectionId: currentSectionId,
      headingPath: [...currentHeadingPath],
    });
  };

  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\\s+(.+)$/.exec(line.trim());
    if (!line.trim()) {
      flush(index);
      startLine = index + 2;
      return;
    }
    if (heading && current.length > 0) flush(index);
    if (current.length === 0) startLine = index + 1;
    if (heading) {
      const level = heading[1]!.length;
      while (headings.length && headings[headings.length - 1]!.level >= level) headings.pop();
      headings.push({ level, title: heading[2]!.trim(), line: index + 1 });
      currentHeadingPath = headings.map((item) => item.title);
      const slug = heading[2]!.toLocaleLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64);
      currentSectionId = `EKDRASIL_WORLD_BIBLE:${index + 1}:${slug || "section"}`;
    }
    current.push(line);
  });
  flush(lines.length);

  ranked.sort((a, b) => b.score - a.score || a.startLine - b.startLine);
  const selected: CanonExcerpt[] = [];
  let remaining = maxChars;
  for (const excerpt of ranked) {
    const attributionCost = 240 + excerpt.sectionId.length + excerpt.headingPath.join(" > ").length;
    const cost = excerpt.text.length + attributionCost;
    if (cost > remaining) continue;
    selected.push(excerpt);
    remaining -= cost;
    if (selected.length >= maxItems || remaining <= 0) break;
  }
  return selected;
}


export interface GameTurnInputMetrics {
  campaignChars: number;
  characterChars: number;
  dossierChars: number;
  npcSimulationChars: number;
  canonFacts: number;
  npcCount: number;
  factionCount: number;
  locationCount: number;
  scheduledEventCount: number;
  fullChronicleEntries: number;
  recentJournalEntries: number;
}

/** Counts payload components without exposing their contents in server logs. */
export function measureGameTurnInput(value: unknown): GameTurnInputMetrics {
  const empty: GameTurnInputMetrics = {
    campaignChars: 0, characterChars: 0, dossierChars: 0, npcSimulationChars: 0,
    canonFacts: 0, npcCount: 0, factionCount: 0, locationCount: 0,
    scheduledEventCount: 0, fullChronicleEntries: 0, recentJournalEntries: 0,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const input = value as Record<string, unknown>;
  const serializedLength = (item: unknown): number => {
    if (item === undefined || item === null) return 0;
    try { return JSON.stringify(item).length; } catch { return 0; }
  };
  const count = (item: unknown): number => Array.isArray(item) ? item.length : 0;
  return {
    campaignChars: serializedLength(input["campaign"]),
    characterChars: serializedLength(input["playerCharacterState"]),
    dossierChars: serializedLength(input["playerDossier"]),
    npcSimulationChars: serializedLength(input["npcSimulationReference"]),
    canonFacts: count(input["canonFacts"]),
    npcCount: count(input["knownNpcs"]),
    factionCount: count(input["knownFactions"]),
    locationCount: count(input["knownLocations"]),
    scheduledEventCount: count(input["scheduledAndDelayedEvents"]),
    fullChronicleEntries: count(input["fullCampaignChronicle"]),
    recentJournalEntries: count(input["recentJournal"]),
  };
}
