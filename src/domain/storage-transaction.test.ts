import { describe, expect, it } from "vitest";
import { createInitialCollections } from "./defaults";
import { loadAllCollections, persistAndVerifyCollections, STORAGE_KEYS, type StorageLike } from "./storage";

function makeStorage(): StorageLike & { failKey: string | null } {
  const values = new Map<string, string>();
  return {
    failKey: null,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (this.failKey === key) {
        this.failKey = null;
        throw new Error("simulated quota failure");
      }
      values.set(key, value);
    },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("local storage transaction rollback", () => {
  it("restores and verifies the previous full snapshot after a partial write failure", () => {
    const storage = makeStorage();
    const original = createInitialCollections();
    expect(persistAndVerifyCollections(storage, original).ok).toBe(true);
    const changed = structuredClone(original);
    changed.world_state.campaignName = "Изменённая кампания";
    changed.player_character_state.name = "Новое имя";
    storage.failKey = STORAGE_KEYS.player_character_state;
    const result = persistAndVerifyCollections(storage, changed);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("Предыдущий снимок всех коллекций восстановлен");
    expect(loadAllCollections(storage)).toEqual(original);
  });
});
