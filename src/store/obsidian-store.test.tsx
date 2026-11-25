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

describe("campaign setup confirmation", () => {
  it("validates and commits the unsaved setup fields in one operation", async () => {
    const storage = createMemoryStorage();
    const initial = createInitialCollections();
    initial.sources = initial.sources.map((source) => ({
      ...source,
      contentStatus: "ATTACHED",
      content: source.type === "GOVERNING_DOC" ? "Полный ОБСИДИАН 4.1" :
        source.type === "WORLD_CANON" ? "# Хроника Экдрасиля\nПодтверждённый источник" : "",
      checksum: "test",
    }));
    initial.world_state.setup = {
      sourcesConfirmed: true, parametersConfirmed: true, startPointConfirmed: true,
      characterConfirmed: true, noAutoImportAcknowledged: true, confirmed: false, confirmedAt: null,
    };
    initial.player_character_state.name = "Лия Вейн";
    initial.player_character_state.nameCertainty = "KNOWN";
    expect(persistAndVerifyCollections(storage, initial).ok).toBe(true);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ObsidianStoreProvider storageOverride={storage}>{children}</ObsidianStoreProvider>
    );
    const { result } = renderHook(() => useObsidianStore(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

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
});
