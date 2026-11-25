import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createInitialCollections } from "@/domain/defaults";
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
  initial.world_state.setup = {
    sourcesConfirmed: true, parametersConfirmed: true, startPointConfirmed: true,
    characterConfirmed: true, noAutoImportAcknowledged: true, confirmed: false, confirmedAt: null,
  };
  initial.player_character_state.name = "Лия Вейн";
  initial.player_character_state.nameCertainty = "KNOWN";
  initial.player_character_state.hpCurrent = 120;
  initial.player_character_state.hpMax = 184;
  initial.player_character_state.armorClass = 20;
  initial.player_character_state.level = 21;
  initial.player_character_state.proficiencyBonus = 6;
  initial.player_character_state.abilityScores = { strength: 20, dexterity: 16, constitution: 16, intelligence: 18, wisdom: 14, charisma: 16 };
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
    expect(confirmation!.error).toContain("проверенные");
    expect(result.current.worldState.setup.confirmed).toBe(false);
  });
});
