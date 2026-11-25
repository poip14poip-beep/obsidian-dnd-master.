import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { evaluateAuthGuard, isPublicAuthRoute, sanitizeRedirectPath } from "@/auth/auth-guard";
import { AuthConfigErrorScreen, AuthErrorScreen, AuthLoadingScreen } from "@/components/AuthGate";
import { readSupabaseEnv } from "@/lib/supabase-auth";

const ALL_PROTECTED_ROUTES = [
  "/",
  "/sources",
  "/canon",
  "/world",
  "/character",
  "/npcs",
  "/factions",
  "/time-map",
  "/turns",
  "/audit",
  "/settings",
] as const;

describe("Supabase Auth env handling & auth guard invariants", () => {
  it("handles missing or invalid VITE_SUPABASE_* env variables gracefully without throwing", () => {
    const missingBoth = readSupabaseEnv({});
    expect(missingBoth.ok).toBe(false);
    if (!missingBoth.ok) {
      expect(missingBoth.missingKeys).toEqual([
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
      ]);
    }

    const missingKey = readSupabaseEnv({
      VITE_SUPABASE_URL: "https://example.supabase.co",
    });
    expect(missingKey.ok).toBe(false);
    if (!missingKey.ok) {
      expect(missingKey.missingKeys).toEqual(["VITE_SUPABASE_PUBLISHABLE_KEY"]);
    }

    const invalidUrl = readSupabaseEnv({
      VITE_SUPABASE_URL: "not-a-url",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
    expect(invalidUrl.ok).toBe(false);

    const valid = readSupabaseEnv({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
    expect(valid.ok).toBe(true);
  });

  it("rejects sb_secret_ and service_role keys in frontend VITE_SUPABASE_PUBLISHABLE_KEY", () => {
    const secretPrefix = readSupabaseEnv({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_should_never_be_in_browser",
    });
    expect(secretPrefix.ok).toBe(false);

    // Legacy JWT with {"role":"service_role"}
    const serviceRolePayload = btoa(JSON.stringify({ role: "service_role" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const fakeServiceJwt = `eyJhbGciOiJIUzI1NiJ9.${serviceRolePayload}.sig`;
    const jwtReject = readSupabaseEnv({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: fakeServiceJwt,
    });
    expect(jwtReject.ok).toBe(false);
  });

  it("blocks unauthenticated routes but allows an explicit local-only prototype when Supabase is unconfigured", () => {
    for (const pathname of ALL_PROTECTED_ROUTES) {
      expect(isPublicAuthRoute(pathname)).toBe(false);
      expect(evaluateAuthGuard({ pathname, status: "unauthenticated" })).toEqual({
        action: "redirect_to_auth",
        redirectTo: pathname,
      });
      expect(evaluateAuthGuard({ pathname, status: "loading" })).toEqual({
        action: "render_loading",
      });
      expect(evaluateAuthGuard({ pathname, status: "error" })).toEqual({
        action: "render_error",
      });
      expect(evaluateAuthGuard({ pathname, status: "unconfigured" })).toEqual({
        action: "allow_protected",
      });
      expect(evaluateAuthGuard({ pathname, status: "authenticated" })).toEqual({
        action: "allow_protected",
      });
    }
  });

  it("keeps /auth and /reset-password public, including local-only mode, and redirects authenticated users off /auth", () => {
    expect(isPublicAuthRoute("/auth")).toBe(true);
    expect(isPublicAuthRoute("/reset-password")).toBe(true);

    expect(evaluateAuthGuard({ pathname: "/auth", status: "unauthenticated" })).toEqual({
      action: "allow_public",
    });
    expect(evaluateAuthGuard({ pathname: "/reset-password", status: "unauthenticated" })).toEqual({
      action: "allow_public",
    });
    expect(
      evaluateAuthGuard({
        pathname: "/auth",
        status: "authenticated",
        redirectParam: "/turns",
      }),
    ).toEqual({
      action: "redirect_to_app",
      target: "/turns",
    });
  });

  it("sanitizes redirect paths to prevent open redirects and auth loops", () => {
    expect(sanitizeRedirectPath("/canon")).toBe("/canon");
    expect(sanitizeRedirectPath("//evil.example.com")).toBe("/");
    expect(sanitizeRedirectPath("https://evil.example.com")).toBe("/");
    expect(sanitizeRedirectPath("/auth")).toBe("/");
    expect(sanitizeRedirectPath("/reset-password")).toBe("/");
    expect(sanitizeRedirectPath(undefined)).toBe("/");
  });

  it("renders dedicated Russian loading, missing-env, and retryable auth error screens", () => {
    const { unmount } = render(<AuthLoadingScreen />);
    expect(screen.getByText("Проверка сессии...")).toBeInTheDocument();
    unmount();

    const cfg = render(
      <AuthConfigErrorScreen
        error="Отсутствуют обязательные переменные окружения."
        missingKeys={["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]}
      />,
    );
    expect(screen.getByText("Supabase Auth не настроен")).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_PUBLISHABLE_KEY/)).toBeInTheDocument();
    cfg.unmount();

    const retry = vi.fn();
    render(<AuthErrorScreen error="Сеть недоступна" onRetry={retry} />);
    expect(screen.getByText("Ошибка проверки авторизации")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить проверку" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});