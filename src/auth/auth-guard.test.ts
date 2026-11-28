import { describe, expect, it } from "vitest";

import { evaluateAuthGuard } from "./auth-guard";

describe("evaluateAuthGuard local guest entry", () => {
  it("routes an unconfigured first-time visitor to explicit local-mode consent", () => {
    expect(evaluateAuthGuard({ pathname: "/", status: "unconfigured" })).toEqual({
      action: "redirect_to_auth",
      redirectTo: "/",
    });
  });

  it("preserves the originally requested protected route through the auth screen", () => {
    expect(evaluateAuthGuard({ pathname: "/turns", status: "unconfigured" })).toEqual({
      action: "redirect_to_auth",
      redirectTo: "/turns",
    });
  });

  it("allows the public auth route without requiring Supabase configuration", () => {
    expect(evaluateAuthGuard({ pathname: "/auth", status: "unconfigured" })).toEqual({
      action: "allow_public",
    });
  });

  it("allows protected routes only after the explicit guest action sets authenticated state", () => {
    expect(evaluateAuthGuard({ pathname: "/turns", status: "authenticated" })).toEqual({
      action: "allow_protected",
    });
  });

  it("does not treat a signed-out user as a guest", () => {
    expect(evaluateAuthGuard({ pathname: "/turns", status: "unauthenticated" })).toEqual({
      action: "redirect_to_auth",
      redirectTo: "/turns",
    });
  });
});
