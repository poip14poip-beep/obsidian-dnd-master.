import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CertaintyBadge } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SOURCE_IDS } from "@/domain/defaults";
import type { CertaintyStatus } from "@/domain/types";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/factions")({
  head: () => ({
    meta: [
      { title: "Фракции — Obsidian Control" },
      {
        name: "description",
        content: "Реестр фракций мира: цели, ресурсы, отношение и история изменений.",
      },
      { property: "og:title", content: "Фракции — Obsidian Control" },
      {
        property: "og:description",
        content: "Реестр фракций мира: цели, ресурсы, отношение и история изменений.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FactionsPage,
});

function FactionsPage() {
  const { sources, factions, addFaction, amendFaction } = useObsidianStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [goals, setGoals] = useState("UNKNOWN");
  const [resources, setResources] = useState("UNKNOWN");
  const [standing, setStanding] = useState("UNKNOWN");
  const [certainty, setCertainty] = useState<CertaintyStatus>("APPROXIMATE");
  const [sourceId, setSourceId] = useState<string>(DEFAULT_SOURCE_IDS.CANON);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGoals, setEditGoals] = useState("");
  const [editResources, setEditResources] = useState("");
  const [editStanding, setEditStanding] = useState("");
  const [editReason, setEditReason] = useState("");

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Укажите название фракции.");
      return;
    }
    const res = addFaction({
      name: name.trim(),
      goals: goals.trim() || "UNKNOWN",
      resources: resources.trim() || "UNKNOWN",
      standing: standing.trim() || "UNKNOWN",
      certainty,
      sourceId,
      locked: true,
    });
    if (res.ok) {
      toast.success("Фракция добавлена.");
      setName("");
      setGoals("UNKNOWN");
      setResources("UNKNOWN");
      setStanding("UNKNOWN");
      setShowCreate(false);
    } else {
      toast.error(res.error);
    }
  }

  function handleAmend(e: FormEvent, id: string, currentCertainty: CertaintyStatus) {
    e.preventDefault();
    if (!editReason.trim()) {
      toast.error("Укажите причину обновления фракции.");
      return;
    }
    const res = amendFaction(id, {
      goals: editGoals,
      resources: editResources,
      standing: editStanding,
      certainty: currentCertainty,
      reason: editReason,
    });
    if (res.ok) {
      toast.success("Ревизия фракции сохранена.");
      setEditingId(null);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">Фракции</h1>
          <p className="text-xs text-muted-foreground">
            Силы, организации и их ресурсы. Изменения фиксируются с историей версий.
          </p>
        </div>
        <Button type="button" className="touch-target" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Новая фракция
        </Button>
      </header>

      {showCreate && (
        <form onSubmit={handleCreate} className="panel-surface space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fac-name">Название</Label>
              <Input
                id="fac-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fac-cert">Уверенность</Label>
              <select
                id="fac-cert"
                value={certainty}
                onChange={(e) => setCertainty(e.target.value as CertaintyStatus)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="KNOWN">KNOWN</option>
                <option value="APPROXIMATE">APPROXIMATE</option>
                <option value="UNKNOWN">UNKNOWN</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fac-goals">Цели</Label>
              <Input
                id="fac-goals"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fac-res">Ресурсы</Label>
              <Input
                id="fac-res"
                value={resources}
                onChange={(e) => setResources(e.target.value)}
                className="touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fac-stand">Положение / отношение</Label>
              <Input
                id="fac-stand"
                value={standing}
                onChange={(e) => setStanding(e.target.value)}
                className="touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fac-src">Источник</Label>
              <select
                id="fac-src"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
                <option value="MANUAL_GM_ENTRY">Ручная запись</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="touch-target">
              Сохранить фракцию
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="touch-target"
              onClick={() => setShowCreate(false)}
            >
              Отмена
            </Button>
          </div>
        </form>
      )}

      {factions.length === 0 ? (
        <div className="panel-surface p-6 text-center text-sm text-muted-foreground">
          Фракции ещё не добавлены.
        </div>
      ) : (
        <div className="space-y-3">
          {factions.map((fac) => (
            <article key={fac.id} className="panel-surface space-y-2.5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{fac.name}</h2>
                  <CertaintyBadge status={fac.certainty} />
                  <span className="mono-code text-xs text-muted-foreground">v{fac.version}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="touch-target"
                  onClick={() => {
                    if (editingId === fac.id) {
                      setEditingId(null);
                    } else {
                      setEditingId(fac.id);
                      setEditGoals(fac.goals);
                      setEditResources(fac.resources);
                      setEditStanding(fac.standing);
                      setEditReason("");
                    }
                  }}
                >
                  Ревизия
                </Button>
              </div>
              <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded bg-background/60 p-2.5">
                  <dt className="text-muted-foreground">Цели</dt>
                  <dd className="mt-0.5 text-foreground">{fac.goals}</dd>
                </div>
                <div className="rounded bg-background/60 p-2.5">
                  <dt className="text-muted-foreground">Ресурсы</dt>
                  <dd className="mt-0.5 text-foreground">{fac.resources}</dd>
                </div>
                <div className="rounded bg-background/60 p-2.5">
                  <dt className="text-muted-foreground">Отношение</dt>
                  <dd className="mt-0.5 text-foreground">{fac.standing}</dd>
                </div>
              </dl>
              {editingId === fac.id && (
                <form
                  onSubmit={(e) => handleAmend(e, fac.id, fac.certainty)}
                  className="space-y-2 border-t border-border pt-3"
                >
                  <Input
                    value={editGoals}
                    onChange={(e) => setEditGoals(e.target.value)}
                    placeholder="Цели"
                    className="touch-target"
                  />
                  <Input
                    value={editResources}
                    onChange={(e) => setEditResources(e.target.value)}
                    placeholder="Ресурсы"
                    className="touch-target"
                  />
                  <Input
                    value={editStanding}
                    onChange={(e) => setEditStanding(e.target.value)}
                    placeholder="Отношение"
                    className="touch-target"
                  />
                  <Input
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Причина ревизии (обязательно)"
                    className="touch-target"
                  />
                  <Button type="submit" size="sm" className="touch-target">
                    Сохранить ревизию
                  </Button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}