import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/auth/auth-context";
import { evaluateAuthGuard } from "@/auth/auth-guard";
import { Button } from "@/components/ui/button";

export function AuthLoadingScreen({ label = "Проверка сессии..." }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="panel-surface flex w-full max-w-sm flex-col items-center gap-3 p-6">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Obsidian Control</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

export function AuthConfigErrorScreen({
  error,
  missingKeys,
}: {
  error: string;
  missingKeys: string[];
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div
        role="alert"
        className="panel-surface w-full max-w-md space-y-4 border-status-danger/60 bg-card p-5"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-status-danger" />
          <div className="space-y-1">
            <h1 className="text-base font-bold text-foreground">Supabase Auth не настроен</h1>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </div>

        {missingKeys.length > 0 && (
          <div className="rounded-md border border-border bg-background/70 p-3 text-xs">
            <p className="font-medium text-foreground">Отсутствуют переменные окружения:</p>
            <ul className="mono-code mt-1.5 space-y-1 text-status-danger">
              {missingKeys.map((key) => (
                <li key={key}>• {key}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Задайте публичный URL проекта и publishable key в переменных окружения (`.env`), не
          добавляя приватный service role key в клиентский код, и перезагрузите страницу.
        </p>
      </div>
    </div>
  );
}

export function AuthErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div
        role="alert"
        className="panel-surface w-full max-w-md space-y-4 border-status-danger/60 p-5"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-status-danger" />
          <div className="space-y-1">
            <h1 className="text-base font-bold text-foreground">Ошибка проверки авторизации</h1>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
        <Button type="button" className="touch-target w-full" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Повторить проверку
        </Button>
      </div>
    </div>
  );
}

export function AuthGate({
  publicChildren,
  protectedChildren,
}: {
  publicChildren: ReactNode;
  protectedChildren: ReactNode;
}) {
  const { status, configError, missingEnvKeys, authError, retryInit } = useAuth();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });

  const searchRecord = location.search as Record<string, unknown>;
  const redirectParam =
    typeof searchRecord["redirect"] === "string" ? searchRecord["redirect"] : undefined;

  const decision = evaluateAuthGuard({
    pathname: location.pathname,
    status,
    redirectParam,
  });

  useEffect(() => {
    if (decision.action === "redirect_to_auth") {
      void navigate({
        to: "/auth",
        search: { redirect: decision.redirectTo },
        replace: true,
      });
    } else if (decision.action === "redirect_to_app") {
      void navigate({
        to: decision.target as "/",
        replace: true,
      });
    }
  }, [decision, navigate]);

  switch (decision.action) {
    case "render_unconfigured":
      return (
        <AuthConfigErrorScreen
          error={configError ?? "Не заданы переменные окружения Supabase Auth."}
          missingKeys={missingEnvKeys}
        />
      );
    case "render_loading":
      return <AuthLoadingScreen />;
    case "render_error":
      return (
        <AuthErrorScreen
          error={authError ?? "Не удалось проверить сессию авторизации."}
          onRetry={() => void retryInit()}
        />
      );
    case "redirect_to_auth":
      return <AuthLoadingScreen label="Переход на страницу входа..." />;
    case "redirect_to_app":
      return <AuthLoadingScreen label="Открытие кампании..." />;
    case "allow_public":
      return <>{publicChildren}</>;
    case "allow_protected":
      return <>{protectedChildren}</>;
  }
}