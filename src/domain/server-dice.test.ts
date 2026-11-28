import { describe, expect, it } from "vitest";
import { rollDiceAtServer } from "./game-master";
import { evaluateRollSuccess, rollDiceFormula as rollServerDice } from "../../supabase/functions/obsidian-gm/dice";

describe("server-authoritative dice", () => {
  const testChallenge = {
  userId: "test-user",
  formula: "1d20+5",
  dc: 15,
  targetType: "DC" as const,
  roller: "PLAYER" as const,
  label: "Проверка Восприятия",
  issuedAt: 1_798_000_000_000,
  nonce: "challenge-nonce",
  signature: "Y2hhbGxlbmdl",
};
  it("resolves advantage with one kept die and applies the modifier once", () => {
    const values = [4, 17];
    const result = rollServerDice("2d20kh1 + 5", () => values.shift()!);
    expect(result.dice.map((die) => [die.value, die.kept])).toEqual([[4, false], [17, true]]);
    expect(result.modifier).toBe(5);
    expect(result.total).toBe(22);
  });

  it("rejects unsupported formulas instead of guessing a result", () => {
    expect(() => rollServerDice("1d7+4", () => 1)).toThrow();
  });

  it("sends the formula to the authenticated Edge Function and validates the returned result", async () => {
    let requestedUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({
        formula: "1d20+5",
        dice: [{ value: 14, sides: 20, kept: true }],
        modifier: 5,
        total: 19,
        proof: { userId: "test-user", issuedAt: 1_798_000_000_000, nonce: "nonce-test", signature: "dGVzdA==", challenge: testChallenge },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await rollDiceAtServer("test-session-token", "1d20+5", testChallenge, {
      fetcher,
      supabaseUrl: "https://example.supabase.co/",
      publishableKey: "sb_publishable_test",
    });

    expect(requestedUrl).toBe("https://example.supabase.co/functions/v1/obsidian-gm");
    expect(requestInit?.method).toBe("POST");
    expect(new Headers(requestInit?.headers).get("Authorization")).toBe("Bearer test-session-token");
    expect(JSON.parse(String(requestInit?.body))).toEqual({ operation: "ROLL_DICE", formula: "1d20+5", challenge: testChallenge });
    expect(result.total).toBe(19);
  });

  it("rejects a server result that does not match the requested formula", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      dice: [{ value: 20, sides: 20, kept: true }],
      modifier: 4,
      total: 24,
      formula: "1d20+4",
      proof: {
        userId: "test-user", issuedAt: 1_798_000_000_000, nonce: "nonce-test", signature: "dGVzdA==",
        challenge: testChallenge,
      },
    }), { status: 200 });

    await expect(rollDiceAtServer("test-session-token", "1d20+5", testChallenge, {
      fetcher,
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    })).rejects.toMatchObject({ code: "DICE_RESULT_MISMATCH" });
  });
  it("applies natural 1 and natural 20 only to attack rolls against AC", () => {
    expect(evaluateRollSuccess("AC", 15, [{ value: 1, sides: 20, kept: true }], 21)).toBe(false);
    expect(evaluateRollSuccess("AC", 25, [{ value: 20, sides: 20, kept: true }], 8)).toBe(true);
    expect(evaluateRollSuccess("DC", 15, [{ value: 1, sides: 20, kept: true }], 18)).toBe(true);
    expect(evaluateRollSuccess("DC", 25, [{ value: 20, sides: 20, kept: true }], 22)).toBe(false);
    expect(evaluateRollSuccess("NONE", null, [{ value: 12, sides: 20, kept: true }], 12)).toBeNull();
  });


});
