import { describe, expect, it } from "vitest";
import { createInitialHitDicePool, calculateRest } from "./rest";
import type { PlayerCharacterState } from "./types";

const character = (patch: Partial<PlayerCharacterState> = {}) => ({
  schemaVersion: 1, stateVersion: 1, sourceDossierId: "test", name: "Герой",
  nameCertainty: "KNOWN" as const, speciesAndClass: "Человек / Воин", level: 3, classLevel: 3,
  hpCurrent: 8, hpMax: 20, hpTemp: 0, armorClass: 16, abilityScores: {
    strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8,
  }, statsCertainty: "KNOWN" as const, currentLocationLabel: "Тест",
  conditions: ["Истощение 2", "Отравлен"], resources: [
    { id: "wind", name: "Второе дыхание", current: 0, max: 3, recovery: "Short/Long Rest", certainty: "KNOWN" as const },
    { id: "surge", name: "Всплеск действий", current: 0, max: 1, recovery: "Long Rest", certainty: "KNOWN" as const },
    { id: "unknown", name: "Неизвестный ресурс", current: null, max: 2, recovery: "Long Rest", certainty: "UNKNOWN" as const },
  ], inventory: [], notes: "", updatedAt: new Date(0).toISOString(),
  hitDice: "1d10", hitDicePool: [{ die: "d10", current: 2, maximum: 3 }],
  ...patch,
}) as PlayerCharacterState;

describe("deterministic rest mechanics", () => {
  it("initializes a hit-dice pool only from a confirmed die and class level", () => {
    expect(createInitialHitDicePool("1d10", 3)).toEqual([{ die: "d10", current: 3, maximum: 3 }]);
    expect(createInitialHitDicePool(null, 3)).toBeUndefined();
    expect(createInitialHitDicePool("unknown", 3)).toBeUndefined();
  });

  it("short rest spends hit dice, applies Constitution, caps healing and restores short-rest resources", () => {
    const result = calculateRest(character(), "SHORT", 2, [6, 4]);
    expect(result).toMatchObject({
      ok: true, elapsedMinutes: 60, hpCurrent: 20, hitDiceSpent: 2,
      healingFromHitDice: 14, hitDicePool: [{ die: "d10", current: 0, maximum: 3 }],
    });
    expect(result.resources[0]?.current).toBe(3);
    expect(result.resources[1]?.current).toBe(0);
    expect(result.conditions).toContain("Истощение 2");
  });

  it("rejects spending unconfirmed or unavailable hit dice", () => {
    const withoutPool = character();
    delete withoutPool.hitDicePool;
    expect(calculateRest(withoutPool, "SHORT", 1, [6])).toMatchObject({ ok: false });
    expect(calculateRest(character(), "SHORT", 3, [6, 4, 5])).toMatchObject({ ok: false });
  });

  it("long rest restores HP and eligible resources, reduces exhaustion and recovers up to half the pool", () => {
    const result = calculateRest(character(), "LONG");
    expect(result).toMatchObject({
      ok: true, elapsedMinutes: 480, hpCurrent: 20, hitDiceRecovered: 1,
      hitDicePool: [{ die: "d10", current: 3, maximum: 3 }],
      conditions: ["Истощение 1", "Отравлен"],
    });
    expect(result.resources[0]?.current).toBe(3);
    expect(result.resources[1]?.current).toBe(1);
    expect(result.resources[2]?.current).toBeNull();
    expect(result.warnings).toContain("Ресурс «Неизвестный ресурс» не восстановлен: текущее или максимальное значение неизвестно.");
  });

  it("does not invent HP or recover resources with unknown values", () => {
    const result = calculateRest(character({ hpCurrent: null, hpMax: null }), "LONG");
    expect(result.hpCurrent).toBeNull();
    expect(result.warnings).toContain("HP не восстановлены: максимальные HP не подтверждены.");
  });
});
