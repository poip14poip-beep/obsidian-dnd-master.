import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createInitialCollections, DEFAULT_SOURCE_IDS } from "@/domain/defaults";
import { generateRandomStart } from "@/domain/random-start";
import { persistAndVerifyCollections, type StorageLike } from "@/domain/storage";
import { ObsidianStoreProvider, useObsidianStore } from "./obsidian-store";

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function createReadySetupCollections() {
  const initial = createInitialCollections();
  const sourceContent = {
    GOVERNING_DOC: "Полный ОБСИДИАН 4.1",
    WORLD_CANON: "# Хроника Экдрасиля\nПодтверждённый источник",
    PLAYER_DOSSIER: "ЛИЯ ВЕЙН\nДосье персонажа игрока",
  } as const;
  initial.sources = initial.sources.map((source) => {
    const content = sourceContent[source.type as keyof typeof sourceContent] ?? "";
    return {
      ...source,
      contentStatus: "ATTACHED" as const,
      content,
      checksum: "test",
      reviewStatus: "VERIFIED" as const,
      contextEnabled: true,
      processing: {
        ...source.processing,
        status: "PROCESSED" as const,
        sha256: "test",
        characterCount: content.length,
        lineCount: content.split("\n").length,
        sectionCount: 1,
        chunkCount: 1,
        dateCandidateCount: 0,
        processedAt: "2026-11-25T12:00:00.000Z",
        warnings: [],
      },
    };
  });
  initial.world_state.campaignPreferences = { allowedBooksAndOptions: "SRD 5.2.1", diceMethod: "Кубики в приложении, открытые броски", advancement: "Milestone", foodAndWater: "Учитывать по правилам выживания", randomEncounters: "Только по обоснованным таблицам", pvp: "Только по согласию игроков", deathAndResurrection: "Только базовые правила 2024", economyDetail: "Средняя детализация", contentBoundaries: "Согласовывать индивидуально", houseRules: "Не используется" };
  initial.world_state.setup = {
    sourcesConfirmed: true, parametersConfirmed: true, startPointConfirmed: true,
    characterConfirmed: true, noAutoImportAcknowledged: true, confirmed: false, confirmedAt: null,
  };
  initial.player_character_state.name = "Тестовый персонаж";
  initial.player_character_state.nameCertainty = "KNOWN";
  initial.player_character_state.hpCurrent = 120;
  initial.player_character_state.hpMax = 184;
  initial.player_character_state.armorClass = 20;
  initial.player_character_state.level = 21;
  initial.player_character_state.proficiencyBonus = 6;
  initial.player_character_state.abilityScores = { strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 };
  initial.player_character_state.speciesAndClass = "Человек · Fighter 20 / Champion";
  initial.player_character_state.baseSavingThrowBonuses = { strength: 11, dexterity: 3, constitution: 9, intelligence: 4, wisdom: 2, charisma: 3 };
  initial.player_character_state.skillBonuses = [{ name: "Атлетика", bonus: 11, basis: "Сила +5, владение +6" }];
  initial.player_character_state.weaponAttacks = [{ weapon: "Катана", attackBonus: 11, damage: "1d8+5", mastery: "Sap" }];
  initial.player_character_state.classFeaturesByLevel = [{ level: 1, features: "Second Wind" }];
  initial.player_character_state.inventory = [{ id: "dossier-katana", name: "Катана в ножнах", quantity: 1, notes: "Из досье", certainty: "KNOWN", location: "UNKNOWN" }];
  return initial;
}

async function renderCampaignStore(storage: StorageLike) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ObsidianStoreProvider storageOverride={storage}>{children}</ObsidianStoreProvider>
  );
  const hook = renderHook(() => useObsidianStore(), { wrapper });
  await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
  return hook;
}

describe("source visibility and campaign separation", () => {
  it("keeps the master prompt and rules out of player-visible sources and uses a neutral character dossier", () => {
    const initial = createInitialCollections();
    const governing = initial.sources.find((source) => source.type === "GOVERNING_DOC");
    const rules = initial.sources.find((source) => source.id === DEFAULT_SOURCE_IDS.SRD);
    const dossier = initial.sources.find((source) => source.type === "PLAYER_DOSSIER");

    expect(governing?.playerVisible).toBe(false);
    expect(governing?.serverManaged).toBe(true);
    expect(rules?.playerVisible).toBe(false);
    expect(rules?.serverManaged).toBe(true);
    expect(dossier?.playerVisible).toBe(false);
    expect(dossier?.id).toBe("src-player-character-dossier");
    expect(dossier?.title).toBe("Лист персонажа текущей кампании");
  });
});

describe("campaign setup confirmation", () => {
  it("validates and commits setup only after all three sources are verified and enabled", async () => {
    const storage = createMemoryStorage();
    const initial = createReadySetupCollections();
    expect(persistAndVerifyCollections(storage, initial).ok).toBe(true);
    const { result } = await renderCampaignStore(storage);

    let confirmation: ReturnType<typeof result.current.confirmCampaignSetup>;
    act(() => {
      confirmation = result.current.confirmCampaignSetup({
        campaignName: "Пробная кампания",
        calendarSystem: "Календарь Экдрасиля",
        startInGameDate: "День 1, 08:00",
        startLocationName: "Начальная площадь",
        encumbranceMode: "STANDARD",
      });
    });

    expect(confirmation!.ok).toBe(true);
    expect(result.current.worldState.setup.confirmed).toBe(true);
    expect(result.current.worldState.campaignName).toBe("Пробная кампания");
    expect(result.current.worldState.currentInGameDate).toBe("День 1, 08:00");
    expect(result.current.worldState.currentLocationId).not.toBeNull();
    expect(result.current.character.currentLocationLabel).toBe("Начальная площадь");
  });

  it("allows a generated random character to start without a player dossier", async () => {
    const storage = createMemoryStorage();
    const initial = createReadySetupCollections();
    initial.player_character_state.sourceDossierId = "GENERATED_RANDOM";
    initial.sources = initial.sources.map((source) => source.type === "PLAYER_DOSSIER"
      ? { ...source, contentStatus: "NOT_ATTACHED", content: "", reviewStatus: "UNREVIEWED", contextEnabled: false }
      : source);
    expect(persistAndVerifyCollections(storage, initial).ok).toBe(true);
    const { result } = await renderCampaignStore(storage);

    let confirmation: ReturnType<typeof result.current.confirmCampaignSetup>;
    act(() => {
      confirmation = result.current.confirmCampaignSetup({
        campaignName: "Случайная кампания",
        calendarSystem: "Календарь Экдрасиля",
        startInGameDate: "День 1, 08:00",
        startLocationName: "Начальная площадь",
        encumbranceMode: "STANDARD",
      });
    });

    expect(confirmation!.ok).toBe(true);
    expect(result.current.worldState.setup.confirmed).toBe(true);
  });

  it("blocks setup when the player dossier is attached but not reviewed and enabled", async () => {
    const storage = createMemoryStorage();
    const initial = createReadySetupCollections();
    initial.sources = initial.sources.map((source) => source.type === "PLAYER_DOSSIER"
      ? { ...source, reviewStatus: "UNREVIEWED", contextEnabled: false }
      : source);
    expect(persistAndVerifyCollections(storage, initial).ok).toBe(true);
    const { result } = await renderCampaignStore(storage);

    let confirmation: ReturnType<typeof result.current.confirmCampaignSetup>;
    act(() => {
      confirmation = result.current.confirmCampaignSetup({
        campaignName: "Пробная кампания",
        calendarSystem: "Календарь Экдрасиля",
        startInGameDate: "День 1, 08:00",
        startLocationName: "Начальная площадь",
        encumbranceMode: "STANDARD",
      });
    });

    expect(confirmation!.ok).toBe(false);
    if (confirmation!.ok === false) {
      expect(confirmation!.error).toContain("проверенные");
    }
    expect(result.current.worldState.setup.confirmed).toBe(false);
  });
});

describe("random free-roam start", () => {
  it("atomically initializes the generated city, scene, HP and isolated inventory without creating a quest or game turn", async () => {
    const storage = createMemoryStorage();
    const { result } = await renderCampaignStore(storage);
    act(() => {
      const imported = result.current.updatePlayerCharacter({
        name: "Лия Вейн", nameCertainty: "KNOWN", hpCurrent: 120, hpMax: 184,
        proficiencyBonus: 6,
        abilityScores: { strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 },
        inventory: [{ id: "dossier-katana", name: "Катана в ножнах", quantity: 1, notes: "Из досье", certainty: "KNOWN", location: "UNKNOWN" }],
      });
      expect(imported.ok).toBe(true);
    });
    const draws = [7, 2, 1, 18, 42];
    const generated = generateRandomStart(184, (length) => {
      const value = draws.shift();
      if (value === undefined || value >= length) throw new Error("Invalid test draw");
      return value;
    });

    let applied: ReturnType<typeof result.current.applyGeneratedStart>;
    act(() => {
      applied = result.current.applyGeneratedStart({
        city: generated.city,
        placeName: generated.placeName,
        date: generated.date,
        narrative: generated.narrative,
        locationDescription: generated.location.description,
        generationRecord: generated.generationRecord,
        characterPatch: generated.characterPatch,
        inventory: generated.inventory,
      });
    });

    expect(applied!.ok).toBe(true);
    expect(result.current.worldState.startLocationName).toBe("Морвейн");
    expect(result.current.worldState.startNarrative).toContain("не задание");
    expect(result.current.locations[0]?.name).toBe("Морвейн");
    expect(result.current.locations[0]?.cityName).toBe("Морвейн");
    expect(result.current.locations[0]?.placeName).toBe("На городском рынке");
    expect(result.current.character.name).toBe("Лия Вейн");
    expect(result.current.character.hpCurrent).toBe(184);
    expect(result.current.character.hpMax).toBe(184);
    expect(result.current.character.inventory).toEqual([{ id: "dossier-katana", name: "Катана в ножнах", quantity: 1, notes: "Из досье", certainty: "KNOWN", location: "UNKNOWN" }]);
    expect(result.current.character.abilityScores?.strength).toBe(20);
    expect(result.current.character.proficiencyBonus).toBe(6);
    expect(result.current.sessionLog.lastTurnNumber).toBe(0);
    expect(result.current.auditLog.entries.at(-1)?.action).toBe("PLAYER_CHARACTER_UPDATED");
    expect(result.current.sessionLog.entries).toHaveLength(0);
    expect(result.current.worldState.setup.confirmed).toBe(false);
  });

  it("does not permit rerolling the start after the campaign has been confirmed", async () => {
    const storage = createMemoryStorage();
    const initial = createReadySetupCollections();
    initial.world_state.setup.confirmed = true;
    expect(persistAndVerifyCollections(storage, initial).ok).toBe(true);
    const { result } = await renderCampaignStore(storage);
    const generated = generateRandomStart(184, (length) => 0);

    let applied: ReturnType<typeof result.current.applyGeneratedStart>;
    act(() => {
      applied = result.current.applyGeneratedStart({
        city: generated.city,
        date: generated.date,
        narrative: generated.narrative,
        locationDescription: generated.location.description,
        generationRecord: generated.generationRecord,
        characterPatch: generated.characterPatch,
        inventory: generated.inventory,
      });
    });

    expect(applied!.ok).toBe(false);
    expect(result.current.worldState.setup.confirmed).toBe(true);
  });
});


describe("clean trial campaign reset", () => {
  it("clears old campaign and character data while preserving verified world and rules sources", async () => {
    const storage = createMemoryStorage();
    const initial = createReadySetupCollections();
    const optionalSrd = initial.sources.find((source) => source.id === DEFAULT_SOURCE_IDS.SRD)!;
    optionalSrd.contentStatus = "NOT_ATTACHED";
    optionalSrd.reviewStatus = "UNREVIEWED";
    optionalSrd.contextEnabled = false;
    initial.sources.push({ ...initial.sources[0]!, id: "old-campaign-map", title: "Старая карта кампании", type: "WORLD_CANON" });
    initial.sources.push({ ...initial.sources[0]!, id: "srd-test", title: "SRD 5.2.1", type: "SUPPLEMENTAL", contentStatus: "ATTACHED", reviewStatus: "VERIFIED", contextEnabled: true, fileName: "SRD_5.2.1.txt", content: "Verified rules text" });
    initial.world_state.campaignName = "Старая кампания";
    initial.world_state.setup.confirmed = true;
    initial.locations = [{ id: "old-location", name: "Старое место", region: "UNKNOWN", description: "Старое состояние", certainty: "KNOWN", sourceId: "src-ekdrasil-chronicle" }];
    initial.npcs = [{ id: "old-npc", name: "Старый NPC", role: "UNKNOWN", locationId: "old-location", factionId: null, goals: "UNKNOWN", attitudeToPlayer: "UNKNOWN", certainty: "KNOWN", sourceId: "src-ekdrasil-chronicle", locked: false, knowledge: [], version: 1, history: [] }];
    initial.session_log.lastTurnNumber = 0;
    expect(persistAndVerifyCollections(storage, initial).ok).toBe(true);
    const { result } = await renderCampaignStore(storage);

    let reset: ReturnType<typeof result.current.resetForTrialCampaign>;
    act(() => { reset = result.current.resetForTrialCampaign(); });

    expect(reset!.ok).toBe(true);
    expect(result.current.worldState.campaignName).toBe("");
    expect(result.current.worldState.setup.confirmed).toBe(false);
    expect(result.current.sessionLog.lastTurnNumber).toBe(0);
    expect(result.current.sessionLog.entries).toHaveLength(0);
    expect(result.current.npcs).toHaveLength(0);
    expect(result.current.locations).toHaveLength(0);
    expect(result.current.character.name).toBe("UNKNOWN");
    expect(result.current.character.speciesAndClass).toBe("UNKNOWN");
    expect(result.current.character.hpCurrent).toBeNull();
    expect(result.current.character.inventory).toHaveLength(0);
    expect(result.current.sources.find((source) => source.id === DEFAULT_SOURCE_IDS.DOSSIER)?.contentStatus).toBe("NOT_ATTACHED");
    expect(result.current.sources.find((source) => source.id === DEFAULT_SOURCE_IDS.DOSSIER)?.content).toBe("");
    expect(result.current.character.currentLocationLabel).toBe("UNKNOWN");
    expect(result.current.sources.filter((source) => source.id !== DEFAULT_SOURCE_IDS.SRD && source.id !== DEFAULT_SOURCE_IDS.DOSSIER).every((source) => source.contentStatus === "ATTACHED")).toBe(true);
    expect(result.current.sources.find((source) => source.id === DEFAULT_SOURCE_IDS.SRD)?.contentStatus).toBe("ATTACHED");
    expect(result.current.sources.some((source) => source.id === "old-campaign-map")).toBe(false);
    expect(result.current.sources.some((source) => source.id === "srd-test")).toBe(false);
    expect(result.current.sources.find((source) => source.type === "GOVERNING_DOC")?.serverManaged).toBe(true);
    expect(result.current.auditLog.entries.at(-1)?.action).toBe("CAMPAIGN_RESET_FOR_TRIAL");
  });
});


describe("explicit resource reconciliation", () => {
  it("allows the player to set a known current resource count without advancing a game turn", async () => {
    const storage = createMemoryStorage();
    const initial = createReadySetupCollections();
    initial.player_character_state.resources = [{ id: "second-wind", name: "Second Wind", current: null, max: 4, recovery: "Short/Long Rest", certainty: "KNOWN" }];
    expect(persistAndVerifyCollections(storage, initial).ok).toBe(true);
    const { result } = await renderCampaignStore(storage);
    let saved: ReturnType<typeof result.current.updateCharacterResource>;
    act(() => { saved = result.current.updateCharacterResource("second-wind", 3); });
    expect(saved!.ok).toBe(true);
    expect(result.current.character.resources[0]?.current).toBe(3);
    expect(result.current.sessionLog.lastTurnNumber).toBe(0);
  });

  it("rejects resource corrections outside the confirmed maximum", async () => {
    const storage = createMemoryStorage();
    const initial = createReadySetupCollections();
    initial.player_character_state.resources = [{ id: "second-wind", name: "Second Wind", current: null, max: 4, recovery: "Short/Long Rest", certainty: "KNOWN" }];
    expect(persistAndVerifyCollections(storage, initial).ok).toBe(true);
    const { result } = await renderCampaignStore(storage);
    let saved: ReturnType<typeof result.current.updateCharacterResource>;
    act(() => { saved = result.current.updateCharacterResource("second-wind", 5); });
    expect(saved!.ok).toBe(false);
    expect(result.current.character.resources[0]?.current).toBeNull();
  });
});
