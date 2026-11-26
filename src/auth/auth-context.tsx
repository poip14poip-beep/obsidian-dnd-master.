import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getSupabaseAuthClient, readSupabaseEnv } from "@/lib/supabase-auth";
import type { AuthStatus } from "./auth-guard";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  needsEmailConfirmation?: boolean;
}

export interface AuthContextValue {
  status: AuthStatus;
  guestMode: boolean;
  enterGuestMode: () => void;
  user: User | null;
  session: Session | null;
  configError: string | null;
  missingEnvKeys: string[];
  authError: string | null;
  isRecoverySession: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  updateRecoveredPassword: (newPassword: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  retryInit: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapSupabaseError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Неверный email или пароль.";
  }
  if (lower.includes("email not confirmed")) {
    return "Email ещё не подтверждён. Проверьте почту и перейдите по ссылке из письма.";
  }
  if (lower.includes("user already registered")) {
    return "Пользователь с таким email уже зарегистрирован.";
  }
  if (lower.includes("password should be at least")) {
    return "Пароль слишком короткий (минимум 6 символов).";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Слишком много попыток. Повторите через минуту.";
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Do not evaluate VITE_* values during SSR/prerender. The browser bundle
  // receives them at build time; the server-side shell must remain neutral.
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [guestMode, setGuestMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [missingEnvKeys, setMissingEnvKeys] = useState<string[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isRecoverySession, setIsRecoverySession] = useState(false);

  const hydrateSession = useCallback(async () => {
    const { client, envResult } = getSupabaseAuthClient();
    if (!envResult.ok || !client) {
      setConfigError(envResult.ok ? "Клиент Auth не готов." : envResult.error);
      setMissingEnvKeys(envResult.ok ? [] : envResult.missingKeys);
      setStatus("unconfigured");
      return;
    }
    setConfigError(null);
    setMissingEnvKeys([]);

    setStatus("loading");
    setAuthError(null);

    try {
      const { data: sessionData, error: sessionErr } = await client.auth.getSession();
      if (sessionErr) {
        setAuthError(mapSupabaseError(sessionErr.message));
        setStatus("error");
        return;
      }

      if (!sessionData.session) {
        setSession(null);
        setUser(null);
        setStatus("unauthenticated");
        return;
      }

      // Revalidate existing session with Supabase Auth server
      const { data: userData, error: userErr } = await client.auth.getUser();
      if (userErr || !userData.user) {
        setSession(null);
        setUser(null);
        setStatus("unauthenticated");
        return;
      }

      setSession(sessionData.session);
      setUser(userData.user);
      setStatus("authenticated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось подключиться к Supabase Auth.";
      setAuthError(msg);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("obsidian:local-guest-mode") === "true") {
        setGuestMode(true);
        setUser(null);
        setSession(null);
        setStatus("authenticated");
        return;
      }
    } catch {
      // Browser storage may be disabled; normal Supabase auth remains available.
    }
    const { client, envResult } = getSupabaseAuthClient();
    if (!envResult.ok || !client) {
      setConfigError(envResult.ok ? "Клиент Auth не готов." : envResult.error);
      setMissingEnvKeys(envResult.ok ? [] : envResult.missingKeys);
      setStatus("unconfigured");
      return;
    }
    setConfigError(null);
    setMissingEnvKeys([]);

    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecoverySession(true);
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setStatus(nextSession?.user ? "authenticated" : "unauthenticated");
        return;
      }
      if (event === "SIGNED_OUT") {
        setIsRecoverySession(false);
        setSession(null);
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setStatus(nextSession?.user ? "authenticated" : "unauthenticated");
      }
    });

    void hydrateSession();

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [hydrateSession]);

  const enterGuestMode = useCallback(() => {
    try {
      window.localStorage.setItem("obsidian:local-guest-mode", "true");
    } catch {
      // Guest mode remains available until page reload when persistent storage is disabled.
    }
    setGuestMode(true);
    setSession(null);
    setUser(null);
    setIsRecoverySession(false);
    setAuthError(null);
    setStatus("authenticated");
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    const { client, envResult } = getSupabaseAuthClient();
    if (!envResult.ok || !client) {
      return { ok: false, error: envResult.ok ? "Клиент Auth не готов." : envResult.error };
    }
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      return { ok: false, error: mapSupabaseError(error.message) };
    }
    try { window.localStorage.removeItem("obsidian:local-guest-mode"); } catch { /* ignore */ }
    setGuestMode(false);
    setSession(data.session);
    setUser(data.user);
    setStatus("authenticated");
    return { ok: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    const { client, envResult } = getSupabaseAuthClient();
    if (!envResult.ok || !client) {
      return { ok: false, error: envResult.ok ? "Клиент Auth не готов." : envResult.error };
    }
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}),
    });
    if (error) {
      return { ok: false, error: mapSupabaseError(error.message) };
    }
    if (!data.session) {
      return { ok: true, needsEmailConfirmation: true };
    }
    try { window.localStorage.removeItem("obsidian:local-guest-mode"); } catch { /* ignore */ }
    setGuestMode(false);
    setSession(data.session);
    setUser(data.user);
    setStatus("authenticated");
    return { ok: true, needsEmailConfirmation: false };
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthActionResult> => {
    const { client, envResult } = getSupabaseAuthClient();
    if (!envResult.ok || !client) {
      return { ok: false, error: envResult.ok ? "Клиент Auth не готов." : envResult.error };
    }
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await client.auth.resetPasswordForEmail(
      email.trim(),
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) {
      return { ok: false, error: mapSupabaseError(error.message) };
    }
    return { ok: true };
  }, []);

  const updateRecoveredPassword = useCallback(
    async (newPassword: string): Promise<AuthActionResult> => {
      const { client, envResult } = getSupabaseAuthClient();
      if (!envResult.ok || !client) {
        return { ok: false, error: envResult.ok ? "Клиент Auth не готов." : envResult.error };
      }
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) {
        return { ok: false, error: mapSupabaseError(error.message) };
      }
      setIsRecoverySession(false);
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { client } = getSupabaseAuthClient();
    if (client) {
      await client.auth.signOut();
    }
    try { window.localStorage.removeItem("obsidian:local-guest-mode"); } catch { /* ignore */ }
    setGuestMode(false);
    setIsRecoverySession(false);
    setSession(null);
    setUser(null);
    setStatus("unauthenticated");
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      guestMode,
      enterGuestMode,
      user,
      session,
      configError,
      missingEnvKeys,
      authError,
      isRecoverySession,
      signIn,
      signUp,
      requestPasswordReset,
      updateRecoveredPassword,
      signOut,
      retryInit: hydrateSession,
    }),
    [
      status,
      guestMode,
      enterGuestMode,
      user,
      session,
      configError,
      missingEnvKeys,
      authError,
      isRecoverySession,
      signIn,
      signUp,
      requestPasswordReset,
      updateRecoveredPassword,
      signOut,
      hydrateSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}