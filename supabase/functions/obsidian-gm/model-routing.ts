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
    if (!["PLAYER", "GM"].includes(String(item["roller"])) ||
        typeof item["label"] !== "string" || !item["label"].trim() ||
        typeof item["formula"] !== "string" || !item["formula"].trim()) {
      return "pending roll requires a valid roller, label and formula";
    }
    if (!["DC", "AC", "NONE"].includes(String(item["targetType"])) ||
        (item["targetType"] === "NONE" ? item["dc"] !== null :
          !Number.isInteger(item["dc"]) || (item["dc"] as number) < 1 || (item["dc"] as number) > 40)) {
      return "roll target type must be DC, AC or NONE, with a fixed target number when required";
    }
    if (item["result"] !== "ОЖИДАЕТСЯ БРОСОК ИГРОКА") {
      return "model attempted to supply a dice result; only the authenticated server may roll";
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
  const hasWorldOutcome = typeof turn["worldOutcome"] === "string" && turn["worldOutcome"].trim().length > 0;
  const hasCampaignMemory = typeof turn["campaignMemory"] === "string" && turn["campaignMemory"].trim().length > 0;
  const hasStateNotes = Array.isArray(turn["stateNotes"]) && turn["stateNotes"].length > 0;
  if (turn["timeDeltaMinutes"] !== 0 || turn["hpDelta"] !== 0 || hasArrayChanges ||
      hasCurrencyChanges || hasNpcChanges || hasQuestChanges ||
      turn["newLocationId"] !== null || hasConsequence || hasWorldOutcome || hasCampaignMemory || hasStateNotes) {
    return "a pending player roll must not mutate campaign or character state";
  }
  return null;
}

/**
 * Engine-boundary guard adapted from Open Dungeon Master: while a roll is
 * pending, narration may frame the attempt but must not state its outcome.
 */
export function validatePendingRollNarration(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const turn = value as Record<string, unknown>;
  if (!Array.isArray(turn["rolls"]) || turn["rolls"].length === 0) return null;
  const narration = [turn["narration"], turn["worldOutcome"]]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .normalize("NFKC");
  const prematureOutcomePatterns = [
    /\bуспешно\s+(?:открыва|взламыва|убежда|замеча|наход|попада|уклоня|сопротивля)/i,
    /\b(?:не удалось|не смог(?:ла)?|не сумел(?:а)?|провал(?:ил|ила|илось)|промахнул(?:ся|ась)|не попал(?:а)?|не заметил(?:а)?|не нашёл|не нашла|не убедил(?:а)?)/i,
    /\b(?:дверь|замок|цель|враг|противник)\b.{0,60}\b(?:открыт|сломлен|повержен|ранен|убит|поражён|поражен)\b/i,
    /\b(?:ты|вы)\s+(?:открываешь|взламываешь|убеждаешь|замечаешь|находишь|попадаешь|промахиваешься|уклоняешься)\b/i,
    /\b(?:successfully|failed to|you hit|you miss|you open|you notice|you find)\b/i,
  ];
  return prematureOutcomePatterns.some((pattern) => pattern.test(narration))
    ? "narration resolves an action before its pending roll has been made"
    : null;
}


export interface RuleExcerpt {
  text: string;
  startLine: number;
  endLine: number;
  score: number;
}

type SearchableExcerpt = RuleExcerpt & { headingPath?: string[] };

function tokenizeSearchText(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu) ?? [];
}

/** BM25-style ranking with rare-term, phrase and canon-heading boosts. */
function rankExcerpts<T extends SearchableExcerpt>(candidates: T[], terms: string[]): T[] {
  const queryTokens = [...new Set(terms.flatMap(tokenizeSearchText))];
  if (!queryTokens.length || !candidates.length) return [];
  const documents = candidates.map((candidate) => {
    const context = [...(candidate.headingPath ?? []), candidate.text].join(" ");
    const tokens = tokenizeSearchText(context);
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    return { candidate, tokens, frequencies, normalized: context.normalize("NFKC").toLocaleLowerCase() };
  });
  const averageLength = documents.reduce((sum, document) => sum + document.tokens.length, 0) /
    Math.max(1, documents.length);
  const documentFrequency = new Map<string, number>();
  for (const token of queryTokens) {
    documentFrequency.set(token, documents.filter((document) => document.frequencies.has(token)).length);
  }
  const ranked = documents.map((document) => {
    let score = 0;
    let matchedTerms = 0;
    for (const token of queryTokens) {
      const frequency = document.frequencies.get(token) ?? 0;
      if (!frequency) continue;
      matchedTerms += 1;
      const df = documentFrequency.get(token) ?? 0;
      const inverseFrequency = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const lengthNorm = 1.2 * (1 - 0.68 + 0.68 * document.tokens.length / Math.max(1, averageLength));
      score += inverseFrequency * (frequency * 2.2) / (frequency + lengthNorm);
    }
    for (const phrase of terms.map((term) => term.normalize("NFKC").toLocaleLowerCase().trim()).filter((term) => term.length > 3)) {
      if (document.normalized.includes(phrase)) score += 1.8;
    }
    const headingTokens = tokenizeSearchText((document.candidate.headingPath ?? []).join(" "));
    score += queryTokens.filter((token) => headingTokens.includes(token)).length * 0.9;
    score += matchedTerms / queryTokens.length;
    return { ...document.candidate, score };
  }).filter((candidate) => candidate.score > 0);
  return ranked.sort((a, b) => b.score - a.score || a.startLine - b.startLine);
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

  const relevanceRanked = rankExcerpts(ranked, terms);
  const selected: RuleExcerpt[] = [];
  let remaining = maxChars;
  for (const excerpt of relevanceRanked) {
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

  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const headings: Array<{ level: number; title: string; line: number }> = [];
  const ranked: CanonExcerpt[] = [];
  let current: string[] = [];
  let startLine = 1;
  let currentHeadingPath: string[] = [];
  let currentSectionId = "EKDRASIL_WORLD_BIBLE:UNSECTIONED";

  const flush = (endLine: number) => {
    const text = current.join("\n").trim();
    current = [];
    if (text.length <= 60) return;
    const lower = text.toLocaleLowerCase();
    const score = normalizedTerms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0) +
      (/^#{1,4}\s/m.test(text) ? 1 : 0);
    if (score > 0) ranked.push({
      text, startLine, endLine, score,
      sectionId: currentSectionId,
      headingPath: [...currentHeadingPath],
    });
  };

  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
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
      const slug = heading[2]!.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64);
      currentSectionId = `EKDRASIL_WORLD_BIBLE:${index + 1}:${slug || "section"}`;
    }
    current.push(line);
  });
  flush(lines.length);

  const relevanceRanked = rankExcerpts(ranked, terms);
  const selected: CanonExcerpt[] = [];
  let remaining = maxChars;
  for (const excerpt of relevanceRanked) {
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
