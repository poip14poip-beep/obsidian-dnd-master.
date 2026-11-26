import { describe, expect, it } from "vitest";
import { isCampaignActive } from "./campaign-state";

describe("campaign activity state", () => {
  it("treats a confirmed setup as active", () => {
    expect(isCampaignActive(true, 0)).toBe(true);
  });

  it("keeps a campaign with recorded turns active if an older save lacks the setup flag", () => {
    expect(isCampaignActive(false, 1)).toBe(true);
  });

  it("keeps a genuinely unstarted campaign behind the setup gate", () => {
    expect(isCampaignActive(false, 0)).toBe(false);
  });
});
