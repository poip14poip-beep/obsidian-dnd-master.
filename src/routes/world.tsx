import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CertaintyBadge, SetupGateBanner } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SOURCE_IDS } from "@/domain/defaults";
import type { CertaintyStatus } from "@/domain/types";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/world")({
  head: () => ({
    meta: [
      { title: "Мир — Obsidian Control" },
      {
        name: "description",
        content: "Контур CAMPAIGN_STATE: состояние мира, последствия ходов и активные угрозы.",
      },
      { property: "og:title", content: "Мир — Obsidian Control" },
      {
        property: "og:description",
        content: "Контур CAMPAIGN_STATE: состояние мира, последствия ходов и активные угрозы.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorldPage,
});

function WorldPage() {
  const { sources, worldState, locations, addWorldConsequence } = useObsidianStore();
  const [summary, setSummary] = useState("");
  const [certainty, setCertainty] = useState<CertaintyStatus>("KNOWN");
  const [sourceId, setSourceId] = useState<string>(DEFAULT_SOURCE_IDS.CANON);

  function handleAddConsequence(e: FormEvent) {
    e.preventDefault();
    if (!summary.trim()) {
      toast.error("Опишите последствие для мира.");
      return;
    }
    const res = addWorldConsequence({
      summary: summary.trim(),
      inGameDate: worldState.currentInGameDate,
      turnNumber: null,
      certainty,
      sourceId,
    });
    if (res.ok) {
      toast.success("Последствие зафиксировано в world_state.");
      setSummary("");
    } else {
      toast.error(res.error);
    }
  }

  const currentLoc = locations.find((l) => l.id === worldState.currentLocationId);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-foreground">Мир (world_state)</h1>
          <span className="mono-code text-xs text-primary">v{worldState.stateVersion}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Объективное состояние живого мира. Строго отделено от листа персонажа
          (player_character_state).
        </p>
      </header>

      <SetupGateBanner confirmed={worldState.setup.confirmed} />

      <section className="panel-surface grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Календарная система</p>
          <p className="mono-code mt-0.5 text-sm font-medium text-foreground">
            {worldState.calendarSystem}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Текущая дата мира</p>
          <p className="mono-code mt-0.5 text-sm font-medium text-foreground">
            {worldState.currentInGameDate}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Опорная локация сцены</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {currentLoc?.name ?? worldState.startLocationName}
          </p>
        </div>
      </section>

      <section className="panel-surface space-y-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">Зафиксировать последствие в мире</h2>
        <form onSubmit={handleAddConsequence} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="csq-text">Описание последствия</Label>
            <Input
              id="csq-text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Например: Стража усилила досмотр на северных воротах"
              className="touch-target"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={certainty}
              onChange={(e) => setCertainty(e.target.value as CertaintyStatus)}
              className="touch-target rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="KNOWN">KNOWN</option>
              <option value="APPROXIMATE">APPROXIMATE</option>
              <option value="UNKNOWN">UNKNOWN</option>
            </select>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="touch-target rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
              <option value="MANUAL_GM_ENTRY">Ручная запись мастера</option>
            </select>
          </div>
          <Button type="submit" className="touch-target">
            <Plus className="mr-1.5 h-4 w-4" />
            Добавить последствие
          </Button>
        </form>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold text-foreground">
          Активные последствия ({worldState.consequences.length})
        </h2>
        {worldState.consequences.length === 0 ? (
          <div className="panel-surface p-5 text-center text-xs text-muted-foreground">
            Последствий пока нет. Они добавляются вручную или автоматически при commit хода.
          </div>
        ) : (
          worldState.consequences.map((c) => (
            <div key={c.id} className="panel-surface flex items-start justify-between gap-3 p-3.5">
              <div className="space-y-1">
                <p className="text-sm text-foreground">{c.summary}</p>
                <p className="mono-code text-[11px] text-muted-foreground">
                  Дата: {c.inGameDate}
                  {c.turnNumber !== null ? ` · Ход #${c.turnNumber}` : " · Вне хода"}
                </p>
              </div>
              <CertaintyBadge status={c.certainty} />
            </div>
          ))
        )}
      </section>
    </div>
  );
}