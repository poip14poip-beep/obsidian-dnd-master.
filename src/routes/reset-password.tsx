import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, KeyRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Восстановление пароля — Obsidian Control" },
      {
        name: "description",
        content: "Установка нового пароля после перехода по ссылке восстановления Supabase Auth.",
      },
      { property: "og:title", content: "Восстановление пароля — Obsidian Control" },
      {
        property: "og:description",
        content: "Установка нового пароля после перехода по ссылке восстановления Supabase Auth.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { isRecoverySession, updateRecoveredPassword } = useAuth();
  const navigate = useNavigate();

  const [hasRecoveryHash, setHasRecoveryHash] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasRecoveryHash(
        window.location.hash.includes("type=recovery") ||
          window.location.search.includes("type=recovery"),
      );
    }
  }, []);

  const canReset = isRecoverySession || hasRecoveryHash;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (newPassword.length < 6) {
      setErrorMsg("Новый пароль должен содержать не менее 6 символов.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Пароли не совпадают.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await updateRecoveredPassword(newPassword);
      if (!res.ok) {
        setErrorMsg(res.error ?? "Не удалось обновить пароль.");
        return;
      }
      setDone(true);
      toast.success("Пароль успешно обновлён.");
      await navigate({ to: "/", replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="panel-surface w-full max-w-md space-y-4 p-5">
        <div className="space-y-1">
          <p className="mono-code text-xs uppercase text-primary">Obsidian Control</p>
          <h1 className="text-lg font-bold text-foreground">Установка нового пароля</h1>
          <p className="text-xs text-muted-foreground">
            Введите новый пароль для вашей учётной записи Supabase Auth.
          </p>
        </div>

        {!canReset && !done && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-status-approx/60 bg-status-approx-bg/40 p-3 text-xs text-status-approx"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Не обнаружена активная ссылка восстановления (`type=recovery`). Запросите новую ссылку
              на странице входа.
            </span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="rounded-md border border-status-danger/60 bg-status-danger-bg/50 p-3 text-xs text-status-danger"
          >
            {errorMsg}
          </div>
        )}

        {done ? (
          <div className="flex items-center gap-2 rounded-md border border-status-verified/50 bg-status-verified-bg/40 p-3 text-xs text-status-verified">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Пароль обновлён. Переходим в приложение...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reset-pwd">Новый пароль</Label>
              <Input
                id="reset-pwd"
                type="password"
                autoComplete="new-password"
                disabled={!canReset || submitting}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                className="touch-target"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-confirm">Повторите пароль</Label>
              <Input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                disabled={!canReset || submitting}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
                className="touch-target"
              />
            </div>
            <Button
              type="submit"
              disabled={!canReset || submitting}
              className="touch-target w-full"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {submitting ? "Сохранение..." : "Сохранить новый пароль"}
            </Button>
          </form>
        )}

        <div className="text-center">
          <Link to="/auth" className="text-xs text-primary underline">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}