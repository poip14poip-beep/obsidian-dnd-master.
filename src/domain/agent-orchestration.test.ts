import { describe, expect, it } from "vitest";
import { formatSpecialistAgentContext, runGameTurnAgents } from "../../supabase/functions/obsidian-gm/agent-orchestration";

describe("parallel specialist game-master agents", () => {
  it("runs canon and rules specialists independently and formats advisory findings", async () => {
    const seenModels: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { model: string };
      seenModels.push(request.model);
      const findings = request.model.startsWith("deepseek/")
        ? ["[CANON SOURCE sectionId=12; lines 20–24] Место подтверждено."]
        : ["[SRD SOURCE lines 44–48] Для поиска подходит проверка Восприятия."];
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ findings, uncertainties: [] }) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const results = await runGameTurnAgents({
      apiKey: "test-key",
      campaignInput: "{\"action\":\"осмотреться\"}",
      canonContext: "Канон 2.4",
      rulesContext: "SRD 5.2.1",
      fetcher,
    });

    expect(seenModels.sort()).toEqual(["deepseek/deepseek-v4.1-flash", "google/gemini-4-argon"]);
    expect(results.every((result) => result.status === "COMPLETED")).toBe(true);
    const formatted = formatSpecialistAgentContext(results);
    expect(formatted).toContain("CANON_AND_CAMPAIGN");
    expect(formatted).toContain("DND_RULES_AND_CHARACTER");
    expect(formatted).toContain("не заменяют полный канон");
  });

  it("marks a failed specialist unavailable without inventing findings", async () => {
    const fetcher: typeof fetch = async () => new Response("provider unavailable", { status: 503 });
    const results = await runGameTurnAgents({
      apiKey: "test-key",
      campaignInput: "{}",
      canonContext: "canon",
      rulesContext: "rules",
      fetcher,
    });

    expect(results.every((result) => result.status === "UNAVAILABLE")).toBe(true);
    expect(results.every((result) => result.findings.length === 0)).toBe(true);
    expect(results.every((result) => result.uncertainties.length > 0)).toBe(true);
  });
});
