import { createFileRoute } from "@tanstack/react-router";
import { Brain, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CertaintyBadge } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SOURCE_IDS } from "@/domain/defaults";
import type { CertaintyStatus } from "@/domain/types";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/npcs")({
  head: () => ({
    meta: [
      { title: "NPC — Obsidian Control" },
      {
        name: "description",
        content:
          "Реестр NPC с целями, локацией, отношением и ограниченным знанием с путём получения.",
      },
      { property: "og:title", content: "NPC — Obsidian Control" },
      {
        property: "og:description",
        content:
          "Реестр NPC с целями, локацией, отношением и ограниченным знанием с путём получения.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NpcsPage,
});

function NpcsPage() {
  const { sources, npcs, locations, factions, worldState, addNpc, amendNpc, addNpcKnowledge } =
    useObsidianStore();
  const [showCreate, setShowCreate] = useState(false);
  const playerVisibleNpcs = npcs.filter((npc) => npc.playerVisible !== false);
  const hiddenNpcCount = npcs.length - playerVisibleNpcs.length;

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [locationId, setLocationId] = useState("");
  const [factionId, setFactionId] = useState("");
  const [goals, setGoals] = useState("UNKNOWN");
  const [attitude, setAttitude] = useState("UNKNOWN");
  const [certainty, setCertainty] = useState<CertaintyStatus>("APPROXIMATE");
  const [sourceId, setSourceId] = useState<string>(DEFAULT_SOURCE_IDS.CANON);

  const [knwNpcId, setKnwNpcId] = useState<string | null>(null);
  const [knwSummary, setKnwSummary] = useState("");
  const [knwPath, setKnwPath] = useState("");
  const [knwCertainty, setKnwCertainty] = useState<CertaintyStatus>("KNOWN");

  const [editNpcId, setEditNpcId] = useState<string | null>(null);
  const [editGoals, setEditGoals] = useState("");
  const [editAttitude, setEditAttitude] = useState("");
  const [editReason, setEditReason] = useState("");

  function handleCreateNpc(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Укажите имя NPC.");
      return;
    }
    const res = addNpc({
      name: name.trim(),
      role: role.trim() || "UNKNOWN",
      locationId: locationId || null,
      factionId: factionId || null,
      goals: goals.trim() || "UNKNOWN",
      attitudeToPlayer: attitude.trim() || "UNKNOWN",
      certainty,
      sourceId,
      locked: true,
    });
    if (res.ok) {
      toast.success("NPC добавлен в реестр.");
      setName("");
      setRole("");
      setGoals("UNKNOWN");
      setAttitude("UNKNOWN");
      setShowCreate(false);
    } else {
      toast.error(res.error);
    }
  }

  function handleAddKnowledge(e: FormEvent) {
    e.preventDefault();
    if (!knwNpcId) return;
    if (!knwSummary.trim() || !knwPath.trim()) {
      toast.error("Укажите содержание знания и путь его получения (NPC не всеведущи).");
      return;
    }
    const res = addNpcKnowledge(knwNpcId, {
      factSummary: knwSummary.trim(),
      sourceId,
      acquisitionPath: knwPath.trim(),
      inGameDate: worldState.currentInGameDate,
      certainty: knwCertainty,
    });
    if (res.ok) {
      toast.success("Знание NPC записано с указанием пути получения.");
      setKnwSummary("");
      setKnwPath("");
      setKnwNpcId(null);
    } else {
      toast.error(res.error);
    }
  }

  function handleAmendNpc(e: FormEvent, npcId: string) {
    e.preventDefault();
    const current = npcs.find((n) => n.id === npcId);
    if (!current) return;
    const res = amendNpc(npcId, {
      role: current.role,
      locationId: current.locationId,
      factionId: current.factionId,
      goals: editGoals.trim() || current.goals,
      attitudeToPlayer: editAttitude.trim() || current.attitudeToPlayer,
      certainty: current.certainty,
      reason: editReason,
    });
    if (res.ok) {
      toast.success("Состояние NPC обновлено с сохранением истории.");
      setEditNpcId(null);
      setEditReason("");
    } else {
      toast.error(res.error);
    }
  }

  const locName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "UNKNOWN";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">Реестр NPC</h1>
          <p className="text-xs text-muted-foreground">
            NPC не всеведущи: каждая единица знания NPC требует явного пути получения и источника.
          </p>
        </div>
        <Button type="button" className="touch-target" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Новый NPC
        </Button>
      </header>

      {showCreate && (
        <form onSubmit={handleCreateNpc} className="panel-surface space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="npc-name">Имя NPC</Label>
              <Input
                id="npc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="npc-role">Роль / статус</Label>
              <Input
                id="npc-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="UNKNOWN"
                className="touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="npc-loc">Локация</Label>
              <select
                id="npc-loc"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">UNKNOWN</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="npc-fac">Фракция</Label>
              <select
                id="npc-fac"
                value={factionId}
                onChange={(e) => setFactionId(e.target.value)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Нет / UNKNOWN</option>
                {factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="npc-goals">Цели NPC</Label>
              <Input
                id="npc-goals"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="npc-att">Отношение к персонажу</Label>
              <Input
                id="npc-att"
                value={attitude}
                onChange={(e) => setAttitude(e.target.value)}
                className="touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="npc-cert">Уверенность</Label>
              <select
                id="npc-cert"
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
              <Label htmlFor="npc-src">Источник</Label>
              <select
                id="npc-src"
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
              Сохранить NPC
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

      {hiddenNpcCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Скрытые записи мастера: {hiddenNpcCount}. Их внутренние цели и знания не показываются игроку.
        </p>
      )}
      {playerVisibleNpcs.length === 0 ? (
        <div className="panel-surface p-6 text-center text-sm text-muted-foreground">
          Открытый реестр NPC пока пуст. Скрытые записи мастера не отображаются; новые сведения появятся здесь только после их раскрытия в игре.
        </div>
      ) : (
        <div className="space-y-3">
          {playerVisibleNpcs.map((npc) => (
            <article key={npc.id} className="panel-surface space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{npc.name}</h2>
                    <CertaintyBadge status={npc.certainty} />
                    <span className="mono-code text-xs text-muted-foreground">v{npc.version}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Роль: {npc.role} · Локация: {locName(npc.locationId)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="touch-target"
                    onClick={() => setKnwNpcId(knwNpcId === npc.id ? null : npc.id)}
                  >
                    <Brain className="mr-1 h-4 w-4" />+ Знание
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="touch-target"
                    onClick={() => {
                      if (editNpcId === npc.id) {
                        setEditNpcId(null);
                      } else {
                        setEditNpcId(npc.id);
                        setEditGoals(npc.goals);
                        setEditAttitude(npc.attitudeToPlayer);
                        setEditReason("");
                      }
                    }}
                  >
                    Ревизия
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div className="rounded bg-background/60 p-2.5">
                  <span className="text-muted-foreground">Цели: </span>
                  <span className="text-foreground">{npc.goals}</span>
                </div>
                <div className="rounded bg-background/60 p-2.5">
                  <span className="text-muted-foreground">Отношение: </span>
                  <span className="text-foreground">{npc.attitudeToPlayer}</span>
                </div>
              </div>

              {editNpcId === npc.id && (
                <form
                  onSubmit={(e) => handleAmendNpc(e, npc.id)}
                  className="space-y-2 border-t border-border pt-3"
                >
                  <Input
                    value={editGoals}
                    onChange={(e) => setEditGoals(e.target.value)}
                    placeholder="Обновлённые цели"
                    className="touch-target"
                  />
                  <Input
                    value={editAttitude}
                    onChange={(e) => setEditAttitude(e.target.value)}
                    placeholder="Обновлённое отношение"
                    className="touch-target"
                  />
                  <Input
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Причина изменения (обязательно)"
                    className="touch-target"
                  />
                  <Button type="submit" size="sm" className="touch-target">
                    Зафиксировать ревизию
                  </Button>
                </form>
              )}

              {knwNpcId === npc.id && (
                <form
                  onSubmit={handleAddKnowledge}
                  className="space-y-2 border-t border-border pt-3"
                >
                  <p className="text-xs font-medium text-layer-npc">
                    Добавить знание NPC (обязателен путь получения)
                  </p>
                  <Input
                    value={knwSummary}
                    onChange={(e) => setKnwSummary(e.target.value)}
                    placeholder="Что именно знает этот NPC?"
                    className="touch-target"
                  />
                  <Input
                    value={knwPath}
                    onChange={(e) => setKnwPath(e.target.value)}
                    placeholder="Как/откуда NPC это узнал? (обязательно)"
                    className="touch-target"
                  />
                  <div className="flex gap-2">
                    <select
                      value={knwCertainty}
                      onChange={(e) => setKnwCertainty(e.target.value as CertaintyStatus)}
                      className="touch-target rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    >
                      <option value="KNOWN">KNOWN</option>
                      <option value="APPROXIMATE">APPROXIMATE</option>
                      <option value="UNKNOWN">UNKNOWN</option>
                    </select>
                    <Button type="submit" size="sm" className="touch-target">
                      Сохранить знание
                    </Button>
                  </div>
                </form>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Ограниченное знание NPC ({npc.knowledge.length})
                </p>
                {npc.knowledge.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Записей знаний нет — NPC не осведомлён о событиях без пути получения.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {npc.knowledge.map((k) => (
                      <li
                        key={k.id}
                        className="rounded border border-border bg-background/50 p-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{k.factSummary}</span>
                          <CertaintyBadge status={k.certainty} />
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          Путь: {k.acquisitionPath} · Дата: {k.inGameDate}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}