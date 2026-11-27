import { describe, expect, it } from "vitest";
import { EKDRASIL_ENGINE_BOUNDARY_RULES } from "./upstream-adoption";

describe("Ekdrasil engine boundary adapted from Open Dungeon Master", () => {
  it("keeps player-character rolls under player control", () => {
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("Не генерируй результат за игрока");
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("Запроси бросок через предусмотренный интерфейс и остановись");
  });

  it("requires server-side random rolls for NPCs", () => {
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("серверным генератором случайных чисел");
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("причина, формула, модификатор и итог");
  });

  it("forbids campaign mutations while a player roll is pending", () => {
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("Ожидающий бросок игрока — граница транзакции");
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("нельзя менять HP, время, инвентарь, валюту, ресурсы");
  });

  it("separates canon, campaign state, character sheets, and NPC knowledge", () => {
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("канон Экдрасиля 2.4");
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("знания каждого NPC");
  });

  it("does not claim that missing mechanics or data have been resolved", () => {
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("явно обозначь ограничение");
    expect(EKDRASIL_ENGINE_BOUNDARY_RULES).toContain("UNKNOWN");
  });
});
