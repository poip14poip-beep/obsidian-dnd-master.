export type AuthStatus = "loading" | "unconfigured" | "error" | "authenticated" | "unauthenticated";

export const PUBLIC_AUTH_ROUTES = new Set<string>(["/auth", "/reset-password"]);

export function isPublicAuthRoute(pathname: string): boolean {
  return PUBLIC_AUTH_ROUTES.has(pathname);
}

/**
 * Allows only safe same-origin relative paths and avoids auth redirect loops.
 */
export function sanitizeRedirectPath(raw: string | undefined | null): string {
  if (!raw || typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (trimmed === "/auth" || trimmed.startsWith("/auth?") || trimmed === "/reset-password") {
    return "/";
  }
  return trimmed;
}

export type GuardDecision =
  | { action: "render_unconfigured" }
  | { action: "render_loading" }
  | { action: "render_error" }
  | { action: "redirect_to_auth"; redirectTo: string }
  | { action: "redirect_to_app"; target: string }
  | { action: "allow_public" }
  | { action: "allow_protected" };

export function evaluateAuthGuard(params: {
  pathname: string;
  status: AuthStatus;
  redirectParam?: string | undefined;
}): GuardDecision {
  const { pathname, status, redirectParam } = params;

  // A missing Supabase configuration enables an explicit local-only prototype mode.
  // No account or cloud sync is implied; the browser store remains the only persistence layer.
  if (status === "unconfigured") {
    return isPublicAuthRoute(pathname) ? { action: "allow_public" } : { action: "allow_protected" };
  }
  if (status === "loading") {
    return { action: "render_loading" };
  }
  if (status === "error") {
    return { action: "render_error" };
  }

  if (isPublicAuthRoute(pathname)) {
    if (pathname === "/auth" && status === "authenticated") {
      return { action: "redirect_to_app", target: sanitizeRedirectPath(redirectParam) };
    }
    return { action: "allow_public" };
  }

  if (status !== "authenticated") {
    return {
      action: "redirect_to_auth",
      redirectTo: sanitizeRedirectPath(pathname),
    };
  }

  return { action: "allow_protected" };
}