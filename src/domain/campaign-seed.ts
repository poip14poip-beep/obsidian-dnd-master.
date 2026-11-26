import { DEFAULT_SOURCE_IDS } from "./defaults";
import { computeChecksum } from "./integrity";
import { extractDossierBasics } from "./dossier-parser";
import { processSourceContent } from "./source-processing";
import type { ObsidianCollections, PlayerCharacterState, SourceDocument } from "./types";

export const EKDRASIL_BUNDLE_VERSION = "2.0.0";

export interface EkdrasilSeedBundle {
  governing: string;
  chronicle: string;
  dossier: string;
}

const SEED_ASSETS = {
  governing: "seed/OBSIDIAN_4.1_DND_2024_MASTER_SYSTEM.md",
  chronicle: "seed/Ekdrasil_Full_Chronicle_v2.md",
  dossier: "seed/Liya_Vein_Full_Dossier_Ekdrasil.md",
} as const;

export async function loadEkdrasilSeed(fetcher: typeof fetch = fetch): Promise<EkdrasilSeedBundle> {
  const base = import.meta.env.BASE_URL || "/";
  const entries = await Promise.all(
    Object.entries(SEED_ASSETS).map(async ([key, path]) => {
      const response = await fetcher(`${base}${path}`);
      if (!response.ok) throw new Error(`Не удалось загрузить ${path} (HTTP ${response.status}).`);
      return [key, await response.text()] as const;
    }),
  );
  const bundle: EkdrasilSeedBundle = { governing: "", chronicle: "", dossier: "" };
  for (const [key, value] of entries) {
    bundle[key as keyof EkdrasilSeedBundle] = value;
  }
  if (!bundle.governing || !bundle.chronicle || !bundle.dossier) {
    throw new Error("Не удалось собрать все три документа встроенного комплекта.");
  }
  if (!bundle.governing.includes("ОБСИДИАН 4.1") ||
      !bundle.chronicle.includes("ЭКДРАСИЛЬ") ||
      !bundle.dossier.includes("ЛИЯ ВЕЙН")) {
    throw new Error("Встроенный комплект Экдрасиля повреждён: контрольные заголовки не найдены.");
  }
  return bundle;
}

function seedDocument(
  source: SourceDocument,
  content: string,
  fileName: string,
  originLabel: string,
  notes: string,
  processing: Awaited<ReturnType<typeof processSourceContent>>,
  now: string,
): SourceDocument {
  return {
    ...source,
    originLabel,
    contentStatus: "ATTACHED",
    reviewStatus: "VERIFIED",
    contextEnabled: true,
    certainty: "KNOWN",
    fileName,
    content,
    checksum: computeChecksum(content),
    attachedAt: now,
    notes,
    processing: processing.processing,
    canonSections: processing.canonSections,
    dateMentions: processing.dateMentions,
  };
}

function dossierParserText(text: string): string {
  return text
    .replace(/<PARSED TEXT FOR PAGE: \d+ \/ \d+>/g, "")
    .replace(/<!-- Страница \d+ оригинального DOCX -->/g, "");
}

function importCharacterFromDossier(
  current: PlayerCharacterState,
  dossierText: string,
  now: string,
): PlayerCharacterState {
  // Never overwrite a character already configured by the player.
  if (current.name !== "UNKNOWN" || current.hpMax !== null || current.level !== null ||
      current.inventory.length > 0 || current.resources.length > 0) return current;

  const basics = extractDossierBasics(dossierParserText(dossierText));
  const importedInventory = basics.inventory.map((item, index) => ({
    id: `lia-dossier-item-${index + 1}`,
    name: item.name,
    quantity: item.quantity,
    notes: item.notes,
    certainty: item.certainty,
    location: item.location === "WORN" ? "WORN" as const : "OTHER" as const,
    startPolicy: item.startPolicy,
  }));
  const importedResources = basics.resources.map((resource, index) => ({
    id: `lia-dossier-resource-${index + 1}`,
    name: resource.name,
    current: resource.current,
    max: resource.max,
    recovery: resource.recovery,
    certainty: resource.certainty,
  }));
  const explicitName = basics.name ? "Лия Вейн" : "UNKNOWN";
  const explicitClass = basics.speciesAndClass ??
    (dossierText.includes("Fighter 20 / Champion") ? "Человек; Fighter 20 / Champion; один эпический уровень кампании (домашнее правило)" : "UNKNOWN");

  return {
    ...current,
    stateVersion: current.stateVersion + 1,
    name: explicitName,
    nameCertainty: basics.name ? "KNOWN" : "UNKNOWN",
    speciesAndClass: explicitClass,
    level: basics.level,
    classLevel: basics.classLevel,
    epicCampaignLevels: basics.epicCampaignLevels,
    hpCurrent: null, // Current HP is not specified by the dossier.
    hpMax: basics.hitPointMaximum,
    hpTemp: null,
    armorClass: basics.armorClass,
    ...(basics.abilityScores ? { abilityScores: basics.abilityScores } : {}),
    proficiencyBonus: basics.proficiencyBonus,
    speedFeet: basics.speedFeet,
    ...(basics.hitDice ? { hitDice: basics.hitDice } : {}),
    ...(basics.savingThrowBonuses ? { savingThrowBonuses: basics.savingThrowBonuses } : {}),
    ...(basics.baseSavingThrowBonuses ? { baseSavingThrowBonuses: basics.baseSavingThrowBonuses } : {}),
    skillBonuses: basics.skillBonuses,
    classFeaturesByLevel: basics.classFeaturesByLevel,
    weaponAttacks: basics.weaponAttacks,
    statsCertainty: basics.abilityScores && basics.hitPointMaximum !== null && basics.armorClass !== null ? "KNOWN" : "APPROXIMATE",
    currentLocationLabel: "UNKNOWN",
    conditions: [],
    resources: importedResources,
    inventory: importedInventory,
    notes: [
      "Автоматически загружено из встроенного досье Лии Вейн, редакция Экдрасиля 2000 года.",
      "Текущие HP, деньги, текущее местоположение и активные состояния в исходном досье не заданы: UNKNOWN.",
      "21-й уровень включает один эпический уровень кампании; это домашнее правило, а не стандартная прогрессия D&D 2024.",
      ...basics.evidence,
    ].join("\n"),
    updatedAt: now,
  };
}

export async function applyEkdrasilSeed(
  collections: ObsidianCollections,
  bundle: EkdrasilSeedBundle,
  now = new Date().toISOString(),
): Promise<ObsidianCollections> {
  const definitions = [
    {
      id: DEFAULT_SOURCE_IDS.GOVERNING,
      fileName: "OBSIDIAN_4.1_DND_2024_MASTER_SYSTEM.md",
      content: bundle.governing,
      origin: "Встроенный исходный документ проекта · ОБСИДИАН 4.1",
      notes: "Полный управляющий документ ОБСИДИАН 4.1. Автоматически встроен в комплект Экдрасиля и передаётся мастеру как обязательная инструкция.",
    },
    {
      id: DEFAULT_SOURCE_IDS.CANON,
      fileName: "Ekdrasil_Full_Chronicle_v2.md",
      content: bundle.chronicle,
      origin: "Встроенный исходный документ проекта · Полная летопись Экдрасиля, редакция 2.0",
      notes: "Полная летопись мира. Заголовки, разделы и фрагменты индексированы с исходными диапазонами строк; даты-кандидаты не превращаются автоматически в игровые события.",
    },
    {
      id: DEFAULT_SOURCE_IDS.DOSSIER,
      fileName: "Liya_Vein_Full_Dossier_Ekdrasil.md",
      content: bundle.dossier,
      origin: "Текстовое представление исходного DOCX из проекта · Досье Лии Вейн",
      notes: "Полное текстовое содержание досье встроено отдельно от канона мира. Явные параметры распознаны в PLAYER_CHARACTER_STATE; неизвестные значения не заполняются.",
    },
  ] as const;

  const processed = await Promise.all(definitions.map((definition) => {
    const source = collections.sources.find((item) => item.id === definition.id);
    if (!source) throw new Error(`В реестре отсутствует обязательный источник ${definition.id}.`);
    return processSourceContent(
      { id: source.id, title: source.title, type: source.type, fileName: definition.fileName },
      definition.content,
      now,
    );
  }));
  const seedById = new Map<string, { definition: (typeof definitions)[number]; processed: (typeof processed)[number] }>();
  definitions.forEach((definition, index) => {
    seedById.set(definition.id, { definition, processed: processed[index]! });
  });

  let sourcesChanged = false;
  const sources = collections.sources.map((source) => {
    const seed = seedById.get(source.id);
    if (!seed) return source;
    // Keep any non-empty source the player has already uploaded or edited.
    if (source.contentStatus === "ATTACHED" && source.content.trim()) return source;
    sourcesChanged = true;
    return seedDocument(
      source,
      seed.definition.content,
      seed.definition.fileName,
      seed.definition.origin,
      seed.definition.notes,
      seed.processed,
      now,
    );
  });

  const playerCharacterState = importCharacterFromDossier(
    collections.player_character_state,
    bundle.dossier,
    now,
  );
  const characterChanged = playerCharacterState !== collections.player_character_state;
  const worldChanged = sourcesChanged || characterChanged;
  const worldState = worldChanged
    ? {
        ...collections.world_state,
        stateVersion: collections.world_state.stateVersion + 1,
        campaignName: collections.world_state.campaignName || "Экдрасиль — свободная кампания",
        calendarSystem: collections.world_state.calendarSystem === "UNKNOWN"
          ? "Летосчисление Экдрасиля (0–2000 годы; точная календарная система UNKNOWN)"
          : collections.world_state.calendarSystem,
        startInGameDate: collections.world_state.startInGameDate === "UNKNOWN"
          ? "2000 год; точная дата и время UNKNOWN"
          : collections.world_state.startInGameDate,
        currentInGameDate: collections.world_state.currentInGameDate === "UNKNOWN"
          ? "2000 год; точная дата и время UNKNOWN"
          : collections.world_state.currentInGameDate,
        startLocationName: collections.world_state.startLocationName || "UNKNOWN",
        setup: {
          ...collections.world_state.setup,
          // Attaching trusted source documents is not the same as the player's final setup acknowledgement.
          sourcesConfirmed: collections.world_state.setup.sourcesConfirmed,
        },
        updatedAt: now,
      }
    : collections.world_state;

  const auditAdded = worldChanged;
  const auditLog = auditAdded
    ? {
        ...collections.audit_log,
        entries: [
          ...collections.audit_log.entries,
          {
            id: `audit-ekdrasil-bundle-${now}`,
            timestamp: now,
            action: "SOURCE_ATTACHED" as const,
            status: "OK" as const,
            details: `Автоматически подключён встроенный комплект Экдрасиля ${EKDRASIL_BUNDLE_VERSION}: управляющий документ, летопись и отдельное досье персонажа. Игровой ход не создан.`,
            campaignVersion: worldState.stateVersion,
            characterVersion: playerCharacterState.stateVersion,
            turnNumber: null,
            checksumSnapshot: computeChecksum({
              bundleVersion: EKDRASIL_BUNDLE_VERSION,
              sourceIds: [DEFAULT_SOURCE_IDS.GOVERNING, DEFAULT_SOURCE_IDS.CANON, DEFAULT_SOURCE_IDS.DOSSIER],
              characterVersion: playerCharacterState.stateVersion,
            }),
          },
        ],
      }
    : collections.audit_log;

  return {
    ...collections,
    sources,
    world_state: worldState,
    player_character_state: playerCharacterState,
    audit_log: auditLog,
  };
}
