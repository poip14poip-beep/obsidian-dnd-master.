import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, KeyRound, Lock, LogIn, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useAuth } from "@/auth/auth-context";
import { sanitizeRedirectPath } from "@/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const authSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => authSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Вход — Obsidian Control" },
      {
        name: "description",
        content:
          "Вход, регистрация и восстановление пароля через Supabase Auth для Obsidian Control.",
      },
      { property: "og:title", content: "Вход — Obsidian Control" },
      {
        property: "og:description",
        content:
          "Вход, регистрация и восстановление пароля через Supabase Auth для Obsidian Control.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type AuthMode = "signin" | "signup" | "forgot";

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { signIn, signUp, requestPasswordReset, enterGuestMode } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  function switchMode(next: AuthMode) {
    setMode(next);
    setErrorMsg(null);
    setInfoMsg(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrorMsg("Введите корректный email.");
      return;
    }

    if (mode !== "forgot") {
      if (password.length < 6) {
        setErrorMsg("Пароль должен содержать не менее 6 символов.");
        return;
      }
      if (mode === "signup" && password !== confirmPassword) {
        setErrorMsg("Пароли не совпадают.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "signin") {
        const res = await signIn(cleanEmail, password);
        if (!res.ok) {
          setErrorMsg(res.error ?? "Не удалось войти.");
          return;
        }
        toast.success("Вход выполнен.");
        const target = sanitizeRedirectPath(redirect);
        await navigate({ to: target as "/", replace: true });
        return;
      }

      if (mode === "signup") {
        const res = await signUp(cleanEmail, password);
        if (!res.ok) {
          setErrorMsg(res.error ?? "Не удалось зарегистрироваться.");
          return;
        }
        if (res.needsEmailConfirmation) {
          setInfoMsg(
            "Аккаунт создан. Проверьте почту и перейдите по ссылке подтверждения, затем выполните вход.",
          );
          toast.info("Проверьте почту для подтверждения email.");
        } else {
          toast.success("Регистрация и вход выполнены.");
          const target = sanitizeRedirectPath(redirect);
          await navigate({ to: target as "/", replace: true });
        }
        return;
      }

      const res = await requestPasswordReset(cleanEmail);
      if (!res.ok) {
        setErrorMsg(res.error ?? "Не удалось отправить письмо для сброса пароля.");
        return;
      }
      setInfoMsg(
        "Если аккаунт с этим email существует, на него отправлена ссылка для восстановления пароля.",
      );
      toast.success("Письмо для восстановления отправлено.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <header className="space-y-1 text-center">
          <p className="mono-code text-xs uppercase tracking-wider text-primary">
            ОБСИДИАН 4.1 · D&D 5e (2024)
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Obsidian Control</h1>
          <p className="text-xs text-muted-foreground">
            Авторизация через Supabase Auth (только учётная запись)
          </p>
        </header>

        <div className="panel-surface space-y-4 p-5">
          <div className="grid grid-cols-3 gap-1.5 rounded-md border border-border bg-background/60 p-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className={`touch-target rounded px-2 text-xs font-medium transition-colors ${
                mode === "signin"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`touch-target rounded px-2 text-xs font-medium transition-colors ${
                mode === "signup"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Регистрация
            </button>
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className={`touch-target rounded px-2 text-xs font-medium transition-colors ${
                mode === "forgot"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Сброс
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-md border border-status-danger/60 bg-status-danger-bg/50 p-3 text-xs text-status-danger"
            >
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="flex items-start gap-2 rounded-md border border-status-verified/50 bg-status-verified-bg/40 p-3 text-xs text-status-verified">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="touch-target"
              />
            </div>

            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Пароль</Label>
                <Input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="touch-target"
                />
              </div>
            )}

            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-confirm">Повторите пароль</Label>
                <Input
                  id="auth-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите пароль"
                  className="touch-target"
                />
              </div>
            )}

            <Button type="submit" disabled={submitting} className="touch-target w-full">
              {mode === "signin" && (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  {submitting ? "Вход..." : "Войти"}
                </>
              )}
              {mode === "signup" && (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {submitting ? "Создание..." : "Зарегистрироваться"}
                </>
              )}
              {mode === "forgot" && (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  {submitting ? "Отправка..." : "Отправить ссылку сброса"}
                </>
              )}
            </Button>
          </form>
          <div className="border-t border-border pt-3">
            <Button type="button" variant="outline" className="touch-target w-full" onClick={() => {
              enterGuestMode();
              toast.success("Открыт локальный режим. Данные кампании останутся в этом браузере.");
              const target = sanitizeRedirectPath(redirect);
              void navigate({ to: target as "/", replace: true });
            }}>
              Продолжить без аккаунта · локальный режим
            </Button>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Локальный режим предназначен для пробной кампании: прогресс хранится только в localStorage этого браузера. Очистка данных сайта удалит кампанию; регулярно скачивай резервную копию. Облачной синхронизации и общего хранилища нет.</p>
          </div>
        </div>

        <div className="panel-surface flex items-start gap-2.5 border-border/70 bg-surface-elevated/50 p-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-status-approx" />
          <p>
            Доступ к разделам кампании закрыт до входа или явного включения локального режима. Данные кампании на текущем этапе хранятся{" "}
            <strong className="text-foreground">только локально в браузере</strong> — облачная
            синхронизация пока не подключена.
          </p>
        </div>
      </div>
    </div>
  );
}