import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseEnvConfig {
  url: string;
  publishableKey: string;
}

export type SupabaseEnvResult =
  { ok: true; config: SupabaseEnvConfig } | { ok: false; missingKeys: string[]; error: string };

export function readSupabaseEnv(
  env: Record<string, string | boolean | undefined> = import.meta.env as Record<
    string,
    string | boolean | undefined
  >,
): SupabaseEnvResult {
  const rawUrl = env["VITE_SUPABASE_URL"];
  const rawKey = env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
  const publishableKey = typeof rawKey === "string" ? rawKey.trim() : "";

  const missingKeys: string[] = [];
  if (!url) missingKeys.push("VITE_SUPABASE_URL");
  if (!publishableKey) missingKeys.push("VITE_SUPABASE_PUBLISHABLE_KEY");

  if (missingKeys.length > 0) {
    return {
      ok: false,
      missingKeys,
      error: `Отсутствуют обязательные переменные окружения: ${missingKeys.join(", ")}.`,
    };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        ok: false,
        missingKeys: [],
        error: "Переменная VITE_SUPABASE_URL должна содержать корректный http(s) URL.",
      };
    }
  } catch {
    return {
      ok: false,
      missingKeys: [],
      error: "Переменная VITE_SUPABASE_URL содержит некорректный URL.",
    };
  }

  if (isForbiddenSecretKey(publishableKey)) {
    return {
      ok: false,
      missingKeys: [],
      error:
        "Недопустимый ключ в VITE_SUPABASE_PUBLISHABLE_KEY: использование secret/service_role ключа во фронтенде запрещено.",
    };
  }

  return { ok: true, config: { url, publishableKey } };
}

function isForbiddenSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (lower.startsWith("sb_secret_") || lower.includes("service_role")) {
    return true;
  }
  // Check JWT payload if key looks like a legacy 3-part JWT
  const parts = key.split(".");
  if (parts.length === 3 && parts[1]) {
    try {
      const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const decoded = atob(padded);
      const payload = JSON.parse(decoded) as Record<string, unknown>;
      if (payload["role"] === "service_role") {
        return true;
      }
    } catch {
      // Not a base64 JSON JWT
    }
  }
  return false;
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAuthClient(): {
  client: SupabaseClient | null;
  envResult: SupabaseEnvResult;
} {
  const envResult = readSupabaseEnv();
  if (!envResult.ok) {
    return { client: null, envResult };
  }
  if (!cachedClient) {
    cachedClient = createClient(envResult.config.url, envResult.config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
      },
    });
  }
  return { client: cachedClient, envResult };
}