export type CertaintyStatus = "KNOWN" | "APPROXIMATE" | "UNKNOWN";

export type EpistemicLayer =
  "OBJECTIVE_TRUTH" | "PLAYER_KNOWLEDGE" | "NPC_KNOWLEDGE" | "OUT_OF_GAME";

export type SourceType = "GOVERNING_DOC" | "WORLD_CANON" | "PLAYER_DOSSIER" | "SUPPLEMENTAL";

export type SourceContentStatus = "NOT_ATTACHED" | "ATTACHED";

export type FactScope = "GLOBAL" | "REGION" | "LOCATION" | "FACTION" | "PERSONAL";

export interface SourceDocument {
  id: string;
  title: string;
  type: SourceType;
  targetPartition: "CAMPAIGN_STATE" | "PLAYER_CHARACTER_STATE" | "SYSTEM_RULES";
  originLabel: string;
  contentStatus: SourceContentStatus;
  certainty: CertaintyStatus;
  fileName: string | null;
  content: string;
  checksum: string;
  attachedAt: string | null;
  notes: string;
}

export interface FactRevision {
  version: number;
  changedAt: string;
  inGameDate: string;
  previousStatement: string;
  previousCertainty: CertaintyStatus;
  previousRationale: string;
  reason: string;
}

export interface CanonFact {
  id: string;
  title: string;
  statement: string;
  rationale: string;
  layer: EpistemicLayer;
  subjectNpcId: string | null;
  certainty: CertaintyStatus;
  sourceId: string;
  acquisitionPath: string;
  inGameDate: string;
  scope: FactScope;
  locked: boolean;
  createdAt: string;
  version: number;
  history: FactRevision[];
}

export interface NpcKnowledgeEntry {
  id: string;
  factSummary: string;
  sourceId: string;
  acquisitionPath: string;
  inGameDate: string;
  certainty: CertaintyStatus;
  recordedAt: string;
}

export interface EntityRevision {
  version: number;
  changedAt: string;
  inGameDate: string;
  summary: string;
  reason: string;
}

export interface NpcRecord {
  id: string;
  name: string;
  role: string;
  locationId: string | null;
  factionId: string | null;
  goals: string;
  attitudeToPlayer: string;
  certainty: CertaintyStatus;
  sourceId: string;
  locked: boolean;
  knowledge: NpcKnowledgeEntry[];
  version: number;
  history: EntityRevision[];
}

export interface FactionRecord {
  id: string;
  name: string;
  goals: string;
  resources: string;
  standing: string;
  certainty: CertaintyStatus;
  sourceId: string;
  locked: boolean;
  version: number;
  history: EntityRevision[];
}

export interface LocationRecord {
  id: string;
  name: string;
  region: string;
  description: string;
  certainty: CertaintyStatus;
  sourceId: string;
}

export interface TravelRoute {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  distanceLabel: string;
  travelTimeHours: number | null;
  certainty: CertaintyStatus;
  notes: string;
}

export interface DelayedEvent {
  id: string;
  title: string;
  triggerInGameDate: string;
  consequence: string;
  status: "SCHEDULED" | "TRIGGERED" | "RESOLVED";
  certainty: CertaintyStatus;
  sourceId: string;
}

export interface WorldConsequence {
  id: string;
  summary: string;
  inGameDate: string;
  turnNumber: number | null;
  certainty: CertaintyStatus;
  sourceId: string;
}

export interface CampaignSetupState {
  sourcesConfirmed: boolean;
  parametersConfirmed: boolean;
  startPointConfirmed: boolean;
  characterConfirmed: boolean;
  noAutoImportAcknowledged: boolean;
  confirmed: boolean;
  confirmedAt: string | null;
}

/**
 * world_state — strictly excludes player_character_state and lives separately
 * from sources, canon_facts, npcs, factions, locations, timeline_events,
 * turn_drafts, session_log, and audit_log.
 */
export interface WorldState {
  schemaVersion: number;
  stateVersion: number;
  campaignName: string;
  ruleset: string;
  calendarSystem: string;
  startInGameDate: string;
  currentInGameDate: string;
  elapsedMinutes: number;
  encumbranceMode: "UNSET" | "STANDARD" | "VARIANT" | "ABSTRACT";
  startLocationName: string;
  currentLocationId: string | null;
  setup: CampaignSetupState;
  routes: TravelRoute[];
  consequences: WorldConsequence[];
  updatedAt: string;
}

export interface CharacterResource {
  id: string;
  name: string;
  current: number | null;
  max: number | null;
  certainty: CertaintyStatus;
  recovery: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  notes: string;
  certainty: CertaintyStatus;
  location?: "CARRIED" | "WORN" | "STORED" | "DROPPED" | "OTHER";
  unitWeightLb?: number | null;
}

/**
 * PLAYER_CHARACTER_STATE — isolated root storage partition.
 * NEVER nested inside CAMPAIGN_STATE.
 */
export interface PlayerCharacterState {
  schemaVersion: number;
  stateVersion: number;
  sourceDossierId: string;
  name: string;
  nameCertainty: CertaintyStatus;
  speciesAndClass: string;
  level: number | null;
  classLevel?: number | null;
  epicCampaignLevels?: number;
  hpCurrent: number | null;
  hpMax: number | null;
  hpTemp: number | null;
  armorClass: number | null;
  abilityScores?: { strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number };
  proficiencyBonus?: number | null;
  speedFeet?: number | null;
  hitDice?: string;
  savingThrowBonuses?: { strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number };
  skillBonuses?: Array<{ name: string; bonus: number; basis: string }>;
  classFeaturesByLevel?: Array<{ level: number; features: string }>;
  weaponAttacks?: Array<{ weapon: string; attackBonus: number; damage: string; mastery: string }>;
  statsCertainty: CertaintyStatus;
  currentLocationLabel: string;
  conditions: string[];
  resources: CharacterResource[];
  inventory: InventoryItem[];
  currency?: { cp: number; sp: number; ep: number; gp: number; pp: number };
  notes: string;
  updatedAt: string;
}

export interface CharacterChangeSet {
  inventory: Array<{ action: "ADD" | "REMOVE" | "SET"; name: string; quantity: number; notes: string; certainty: CertaintyStatus }>;
  resources: Array<{ name: string; current: number | null; max: number | null; recovery: string; certainty: CertaintyStatus }>;
  conditions: Array<{ action: "ADD" | "REMOVE"; name: string }>;
  currencyDelta: { cp: number; sp: number; ep: number; gp: number; pp: number };
}

export interface WorldChangeSet {
  facts: Array<{
    title: string; statement: string; rationale: string; layer: Exclude<EpistemicLayer, "NPC_KNOWLEDGE">;
    subjectNpcId: string | null; certainty: CertaintyStatus; scope: FactScope;
  }>;
  npcUpdates: Array<{
    npcId: string; role: string | null; locationId: string | null; factionId: string | null;
    goals: string | null; attitudeToPlayer: string | null; certainty: CertaintyStatus | null; reason: string;
  }>;
  npcKnowledgeAdditions: Array<{
    npcId: string; factSummary: string; sourceId: string; acquisitionPath: string; certainty: CertaintyStatus;
  }>;
  newNpcs: Array<{
    tempId: string; name: string; role: string; locationId: string | null; factionId: string | null;
    goals: string; attitudeToPlayer: string; certainty: CertaintyStatus;
  }>;
  factionUpdates: Array<{
    factionId: string; goals: string | null; resources: string | null; standing: string | null;
    certainty: CertaintyStatus | null; reason: string;
  }>;
  newFactions: Array<{
    tempId: string; name: string; goals: string; resources: string; standing: string; certainty: CertaintyStatus;
  }>;
  delayedEvents: Array<{
    title: string; triggerInGameDate: string; consequence: string;
    status: "SCHEDULED" | "TRIGGERED" | "RESOLVED"; certainty: CertaintyStatus;
  }>;
}

export interface RollRecord {
  id: string;
  label: string;
  formula: string;
  result: string;
}

export interface TurnDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  playerIntent: string;
  worldOutcome: string;
  gmNarration?: string;
  characterChanges?: CharacterChangeSet;
  worldChanges?: WorldChangeSet;
  timeDeltaMinutes: number;
  newInGameDate: string;
  newLocationId: string;
  hpDelta: number;
  consequenceText: string;
  newFactTitle: string;
  newFactStatement: string;
  newFactRationale: string;
  newFactLayer: EpistemicLayer;
  newFactCertainty: CertaintyStatus;
  newFactSourceId: string;
  rolls: RollRecord[];
  checkedAt: string | null;
  validationErrors: string[];
}

export interface GameTurnEntry {
  id: string;
  entryType: "GAME_TURN";
  turnNumber: number;
  committedAt: string;
  inGameDateBefore: string;
  inGameDateAfter: string;
  timeDeltaMinutes: number;
  summary: string;
  playerIntent: string;
  worldOutcome: string;
  gmNarration?: string;
  characterChanges?: CharacterChangeSet;
  worldChanges?: WorldChangeSet;
  locationIdAfter: string | null;
  hpDelta: number;
  rolls: RollRecord[];
  affectedCampaignVersion: number;
  affectedCharacterVersion: number;
  entryChecksum: string;
}

export interface TechnicalMessageEntry {
  id: string;
  entryType: "TECHNICAL_NOTE";
  recordedAt: string;
  inGameDateSnapshot: string;
  text: string;
  advancesTime: false;
}

export type JournalEntry = GameTurnEntry | TechnicalMessageEntry;

export interface SessionLogState {
  schemaVersion: number;
  lastTurnNumber: number;
  entries: JournalEntry[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action:
    | "SETUP_CONFIRMED"
    | "TURN_COMMITTED"
    | "TURN_COMMIT_FAILED"
    | "TECHNICAL_NOTE_ADDED"
    | "FACT_AMENDED"
    | "ENTITY_AMENDED"
    | "SOURCE_ATTACHED"
    | "BACKUP_EXPORTED"
    | "BACKUP_IMPORTED"
    | "INTEGRITY_CHECK";
  status: "OK" | "ERROR";
  details: string;
  campaignVersion: number;
  characterVersion: number;
  turnNumber: number | null;
  checksumSnapshot: string;
}

export interface AuditLogState {
  schemaVersion: number;
  entries: AuditEntry[];
}

export interface ObsidianCollections {
  sources: SourceDocument[];
  canon_facts: CanonFact[];
  world_state: WorldState;
  player_character_state: PlayerCharacterState;
  npcs: NpcRecord[];
  factions: FactionRecord[];
  locations: LocationRecord[];
  timeline_events: DelayedEvent[];
  turn_drafts: TurnDraft[];
  session_log: SessionLogState;
  audit_log: AuditLogState;
}

export type CollectionName = keyof ObsidianCollections;

export interface IntegrityCheckItem {
  id: string;
  label: string;
  passed: boolean;
  details: string;
}

export interface IntegrityReport {
  checkedAt: string;
  ok: boolean;
  checks: IntegrityCheckItem[];
  checksums: Record<CollectionName, string>;
}

export interface BackupEnvelope {
  app: "Obsidian Control";
  backupVersion: 2;
  exportedAt: string;
  storageDisclaimer: string;
  collections: ObsidianCollections;
  checksums: Record<CollectionName, string>;
}