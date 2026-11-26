import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Clock,
  FileText,
  Flag,
  Globe,
  LayoutGrid,
  Lock,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  Swords,
  SlidersHorizontal,
  User,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/auth-context";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useObsidianStore } from "@/store/obsidian-store";
import { cn } from "@/lib/utils";

export type NavRoutePath =
  | "/"
  | "/sources"
  | "/canon"
  | "/world"
  | "/character"
  | "/npcs"
  | "/factions"
  | "/time-map"
  | "/turns"
  | "/game"
  | "/audit"
  | "/settings";

export const NAV_ITEMS: ReadonlyArray<{
  to: NavRoutePath;
  label: string;
  shortLabel: string;
  icon: typeof LayoutGrid;
}> = [
  { to: "/", label: "Обзор", shortLabel: "Обзор", icon: LayoutGrid },
  { to: "/sources", label: "Источники", shortLabel: "Источники", icon: FileText },
  { to: "/canon", label: "Канон", shortLabel: "Канон", icon: BookOpen },
  { to: "/world", label: "Мир", shortLabel: "Мир", icon: Globe },
  { to: "/character", label: "Персонаж", shortLabel: "Персонаж", icon: User },
  { to: "/npcs", label: "NPC", shortLabel: "NPC", icon: Users },
  { to: "/factions", label: "Фракции", shortLabel: "Фракции", icon: Flag },
  { to: "/time-map", label: "Время и карта", shortLabel: "Карта", icon: Clock },
  { to: "/game", label: "Играть", shortLabel: "Игра", icon: Swords },
  { to: "/turns", label: "Ходы и журнал", shortLabel: "Журнал", icon: ScrollText },
  { to: "/audit", label: "Проверка/аудит", shortLabel: "Аудит", icon: ShieldCheck },
  {
    to: "/settings",
    label: "Настройки кампании",
    shortLabel: "Настройки",
    icon: SlidersHorizontal,
  },
];

const MOBILE_BOTTOM_PATHS: ReadonlyArray<NavRoutePath> = ["/", "/game", "/character", "/canon"];

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, guestMode, status: authStatus, signOut } = useAuth();
  const { worldState, sessionLog, lastIntegrityReport } = useObsidianStore();

  const currentNav = NAV_ITEMS.find((item) => item.to === pathname) ?? NAV_ITEMS[0];

  async function handleLogout() {
    setDrawerOpen(false);
    await signOut();
    toast.info("Вы вышли из аккаунта.");
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {guestMode && (
        <div role="status" className="border-b border-status-approx/40 bg-status-approx/10 px-3 py-2 text-center text-xs text-status-approx">
          Локальный режим: кампания хранится только в этом браузере. Экспортируйте резервную копию; облачная синхронизация недоступна.
        </div>
      )}
      {authStatus === "unconfigured" && !guestMode && (
        <div role="status" className="border-b border-status-approx/40 bg-status-approx/10 px-3 py-2 text-center text-xs text-status-approx">
          Для пробной игры выберите локальный режим на экране входа. Облачная авторизация не настроена.
        </div>
      )}
      {/* Desktop persistent left sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-bold tracking-tight text-sidebar-foreground">
              Obsidian Control
            </span>
            <span className="mono-code rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              4.1
            </span>
          </div>
          <p className="mono-code mt-1 text-[11px] text-muted-foreground">
            {guestMode ? "ЛОКАЛЬНЫЙ РЕЖИМ · ДАННЫЕ ЭТОГО БРАУЗЕРА" : null}
            {worldState.setup.confirmed
              ? `АКТИВНА · ХОД #${sessionLog.lastTurnNumber}`
              : "ПОДГОТОВКА · БЛОК"}
          </p>
        </div>

        <nav aria-label="Основная навигация" className="flex-1 space-y-1 overflow-y-auto p-2.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "touch-target flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.to === "/game" && !worldState.setup.confirmed && (
                  <Lock className="h-3.5 w-3.5 text-status-approx" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2.5 border-t border-sidebar-border px-4 py-3 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Целостность</span>
            <span
              className={cn(
                "mono-code font-semibold",
                lastIntegrityReport?.ok ? "text-status-verified" : "text-status-danger",
              )}
            >
              {lastIntegrityReport?.ok ? "OK" : "CHECK"}
            </span>
          </div>
          <div className="space-y-1 border-t border-sidebar-border pt-2">
            <p className="truncate font-medium text-sidebar-foreground">
              {guestMode ? "Гостевой режим" : user?.email ?? "Авторизованный пользователь"}
            </p>
            <p className="text-[10px] text-status-approx">
              Локальный слой · без облачной синхронизации
            </p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="touch-target mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-sidebar-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-sidebar-accent"
            >
              <LogOut className="h-3.5 w-3.5" />
              Выйти
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-sidebar/95 px-3 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Открыть все разделы"
                className="touch-target inline-flex items-center justify-center rounded-md border border-border bg-card text-foreground"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
              <SheetHeader className="border-b border-sidebar-border px-4 py-4 text-left">
                <SheetTitle className="text-base font-bold text-sidebar-foreground">
                  Obsidian Control
                </SheetTitle>
                <p className="mono-code text-[11px] text-muted-foreground">
                  D&D 5e (2024) · ОБСИДИАН 4.1
                </p>
                <p className="truncate pt-1 text-xs text-foreground">
                  {guestMode ? "Гостевой режим" : user?.email ?? "Авторизованный пользователь"}
                </p>
                <p className="text-[10px] text-status-approx">
                  Локальный слой · облачная синхронизация не подключена
                </p>
              </SheetHeader>
              <nav
                aria-label="Все разделы навигации"
                className="flex flex-col gap-1 overflow-y-auto p-2.5"
              >
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        "touch-target flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium",
                        active
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {item.to === "/game" && !worldState.setup.confirmed && (
                        <Lock className="h-3.5 w-3.5 text-status-approx" />
                      )}
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-sidebar-border p-3">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="touch-target flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border bg-card px-3 py-2 text-sm font-medium text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  {guestMode ? "Выйти из гостевого режима" : "Выйти из аккаунта"}
                </button>
                {guestMode && (
                  <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-foreground">
                    После выхода откроется регистрация или вход. Локальные данные кампании не удаляются автоматически.
                  </p>
                )}
              </div>
              <div className="border-t border-sidebar-border p-3">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="touch-target flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border bg-card px-3 py-2 text-sm font-medium text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Выйти из аккаунта
                </button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {currentNav?.label ?? "Obsidian Control"}
            </p>
            <p className="mono-code truncate text-[10px] text-muted-foreground">
              Obsidian Control ·{" "}
              {worldState.setup.confirmed ? `Ход #${sessionLog.lastTurnNumber}` : "Блок старта"}
            </p>
          </div>
        </div>

        <Link
          to="/audit"
          className={cn(
            "mono-code inline-flex h-8 shrink-0 items-center rounded border px-2 text-[11px] font-semibold",
            lastIntegrityReport?.ok
              ? "border-status-verified/40 bg-status-verified-bg text-status-verified"
              : "border-status-danger/40 bg-status-danger-bg text-status-danger",
          )}
        >
          {lastIntegrityReport?.ok ? "АУДИТ OK" : "АУДИТ !"}
        </Link>
      </header>

      {/* Main content area */}
      <main className="min-h-screen px-3 pt-4 pb-24 sm:px-5 lg:ml-64 lg:px-8 lg:py-6">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>

      {/* Android-first fixed bottom navigation */}
      <nav
        aria-label="Нижняя навигация"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-sidebar/95 backdrop-blur lg:hidden"
      >
        {MOBILE_BOTTOM_PATHS.map((path) => {
          const item = NAV_ITEMS.find((n) => n.to === path)!;
          const Icon = item.icon;
          const active = pathname === item.to;
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                "touch-target flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.shortLabel}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="touch-target flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          <span>Разделы</span>
        </button>
      </nav>
    </div>
  );
}