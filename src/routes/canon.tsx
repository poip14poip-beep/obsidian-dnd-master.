import { createFileRoute } from "@tanstack/react-router";
import { History, Lock, Plus, Unlock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CertaintyBadge, LayerBadge } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SOURCE_IDS } from "@/domain/defaults";
import type { CertaintyStatus, EpistemicLayer, FactScope } from "@/domain/types";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/canon")({
  head: () => ({
    meta: [
      { title: "Канон — Obsidian Control" },
      {
        name: "description",
        content: "Реестр фактов с источником, слоями знания, уверенностью и историей ревизий.",
      },
      { property: "og:title", content: "Канон — Obsidian Control" },
      {
        property: "og:description",
        content: "Реестр фактов с источником, слоями знания, уверенностью и историей ревизий.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CanonPage,
});

function CanonPage() {
  const { sources, canonFacts, npcs, worldState, addFact, amendFact, toggleFactLock } =
    useObsidianStore();
  const [layerFilter, setLayerFilter] = useState<EpistemicLayer | "ALL">("ALL");
  const [showCreate, setShowCreate] = useState(false);

  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [rationale, setRationale] = useState("");
  const [layer, setLayer] = useState<EpistemicLayer>("OBJECTIVE_TRUTH");
  const [subjectNpcId, setSubjectNpcId] = useState("");
  const [certainty, setCertainty] = useState<CertaintyStatus>("KNOWN");
  const [sourceId, setSourceId] = useState<string>(DEFAULT_SOURCE_IDS.CANON);
  const [acquisitionPath, setAcquisitionPath] = useState("");
  const [inGameDate, setInGameDate] = useState("");
  const [scope, setScope] = useState<FactScope>("GLOBAL");

  const [amendingId, setAmendingId] = useState<string | null>(null);
  const [amendStatement, setAmendStatement] = useState("");
  const [amendRationale, setAmendRationale] = useState("");
  const [amendCertainty, setAmendCertainty] = useState<CertaintyStatus>("KNOWN");
  const [amendReason, setAmendReason] = useState("");

  const visibleFacts =
    layerFilter === "ALL" ? canonFacts : canonFacts.filter((f) => f.layer === layerFilter);

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !statement.trim() || !rationale.trim()) {
      toast.error("Заполните заголовок, формулировку и обоснование факта.");
      return;
    }
    if (layer === "NPC_KNOWLEDGE" && !acquisitionPath.trim()) {
      toast.error("Для знания NPC обязательно укажите путь получения информации.");
      return;
    }
    const res = addFact({
      title: title.trim(),
      statement: statement.trim(),
      rationale: rationale.trim(),
      layer,
      subjectNpcId: layer === "NPC_KNOWLEDGE" && subjectNpcId ? subjectNpcId : null,
      certainty,
      sourceId,
      acquisitionPath: acquisitionPath.trim() || "Зафиксировано из выбранного источника",
      inGameDate: inGameDate.trim() || worldState.currentInGameDate,
      scope,
      locked: true,
    });
    if (res.ok) {
      toast.success("Факт добавлен с provenance и заблокирован от скрытой перезаписи.");
      setTitle("");
      setStatement("");
      setRationale("");
      setAcquisitionPath("");
      setShowCreate(false);
    } else {
      toast.error(res.error);
    }
  }

  function handleAmend(e: FormEvent) {
    e.preventDefault();
    if (!amendingId) return;
    const res = amendFact(amendingId, {
      statement: amendStatement,
      rationale: amendRationale,
      certainty: amendCertainty,
      reason: amendReason,
    });
    if (res.ok) {
      toast.success("Добавлена новая ревизия факта; предыдущая версия сохранена в истории.");
      setAmendingId(null);
      setAmendReason("");
    } else {
      toast.error(res.error);
    }
  }

  const sourceTitleById = (id: string) =>
    sources.find((s) => s.id === id)?.title ??
    (id === "MANUAL_GM_ENTRY" ? "Ручная запись мастера" : id);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">Канон и факты</h1>
          <p className="text-xs text-muted-foreground">
            Разделение объективной истины, знаний персонажа, знаний NPC и внеигровых заметок. У
            каждой записи хранятся источник, дата, уверенность, область действия и история ревизий.
          </p>
        </div>
        <Button type="button" className="touch-target" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Новый факт
        </Button>
      </header>

      {/* Layer filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(
          [
            ["ALL", "Все слои"],
            ["OBJECTIVE_TRUTH", "Объективная истина"],
            ["PLAYER_KNOWLEDGE", "Знание персонажа"],
            ["NPC_KNOWLEDGE", "Знание NPC"],
            ["OUT_OF_GAME", "Внеигровое (OOC)"],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setLayerFilter(val)}
            className={`touch-target shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              layerFilter === val
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="panel-surface space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Зафиксировать факт</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fact-title">Заголовок факта</Label>
              <Input
                id="fact-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Краткое имя факта"
                className="touch-target"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fact-layer">Слой знания</Label>
              <select
                id="fact-layer"
                value={layer}
                onChange={(e) => setLayer(e.target.value as EpistemicLayer)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="OBJECTIVE_TRUTH">Объективная истина</option>
                <option value="PLAYER_KNOWLEDGE">Знание персонажа</option>
                <option value="NPC_KNOWLEDGE">Знание NPC</option>
                <option value="OUT_OF_GAME">Внеигровая информация (OOC)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fact-certainty">Статус уверенности</Label>
              <select
                id="fact-certainty"
                value={certainty}
                onChange={(e) => setCertainty(e.target.value as CertaintyStatus)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="KNOWN">KNOWN (точно известно)</option>
                <option value="APPROXIMATE">APPROXIMATE (приблизительно)</option>
                <option value="UNKNOWN">UNKNOWN (неизвестно / гипотеза)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fact-source">Источник (Provenance)</Label>
              <select
                id="fact-source"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
                <option value="MANUAL_GM_ENTRY">Ручная запись мастера</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fact-date">Внутриигровая дата/время</Label>
              <Input
                id="fact-date"
                value={inGameDate}
                onChange={(e) => setInGameDate(e.target.value)}
                placeholder={worldState.currentInGameDate}
                className="touch-target"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fact-scope">Область действия</Label>
              <select
                id="fact-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as FactScope)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="GLOBAL">GLOBAL (мир)</option>
                <option value="REGION">REGION (регион)</option>
                <option value="LOCATION">LOCATION (локация)</option>
                <option value="FACTION">FACTION (фракция)</option>
                <option value="PERSONAL">PERSONAL (персональный)</option>
              </select>
            </div>
          </div>
          {layer === "NPC_KNOWLEDGE" && (
            <div className="space-y-1.5">
              <Label htmlFor="fact-npc">Связанный NPC (необязательно)</Label>
              <select
                id="fact-npc"
                value={subjectNpcId}
                onChange={(e) => setSubjectNpcId(e.target.value)}
                className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Не выбран</option>
                {npcs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="fact-path">Путь получения / ссылка на фрагмент</Label>
            <Input
              id="fact-path"
              value={acquisitionPath}
              onChange={(e) => setAcquisitionPath(e.target.value)}
              placeholder="Например: Хроника, глава 2 / услышано от стражника"
              className="touch-target"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fact-stmt">Формулировка факта</Label>
            <Textarea
              id="fact-stmt"
              rows={3}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Точная формулировка без домыслов..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fact-rationale">Обоснование *</Label>
            <Input
              id="fact-rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Почему факт имеет выбранный класс истины и статус уверенности"
              className="touch-target"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="touch-target">
              Зафиксировать факт
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

      {visibleFacts.length === 0 ? (
        <div className="panel-surface p-6 text-center text-sm text-muted-foreground">
          В выбранном слое пока нет зафиксированных фактов. Канон не заполняется автоматически.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleFacts.map((fact) => {
            const isAmending = amendingId === fact.id;
            return (
              <article key={fact.id} className="panel-surface space-y-2.5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="text-sm font-semibold text-foreground">{fact.title}</h2>
                      <LayerBadge layer={fact.layer} />
                      <CertaintyBadge status={fact.certainty} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Источник:{" "}
                      <span className="text-foreground">{sourceTitleById(fact.sourceId)}</span> ·
                      Дата: <span className="mono-code">{fact.inGameDate}</span> · Область:{" "}
                      <span className="mono-code">{fact.scope}</span> · v{fact.version}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="touch-target"
                      aria-label={fact.locked ? "Утверждён" : "Черновик"}
                      onClick={() => toggleFactLock(fact.id)}
                    >
                      {fact.locked ? (
                        <Lock className="h-4 w-4 text-primary" />
                      ) : (
                        <Unlock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="touch-target"
                      onClick={() => {
                        if (isAmending) {
                          setAmendingId(null);
                        } else {
                          setAmendingId(fact.id);
                          setAmendStatement(fact.statement);
                          setAmendRationale(fact.rationale);
                          setAmendCertainty(fact.certainty);
                          setAmendReason("");
                        }
                      }}
                    >
                      Ревизия
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-foreground">{fact.statement}</p>
                <p className="text-xs text-muted-foreground">
                  Обоснование: <span className="text-foreground">{fact.rationale}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Путь получения: {fact.acquisitionPath}
                </p>

                {isAmending && (
                  <form onSubmit={handleAmend} className="space-y-2.5 border-t border-border pt-3">
                    <p className="text-xs text-status-approx">
                      Утверждённые факты не переписываются задним числом: прежняя версия останется в
                      истории изменений.
                    </p>
                    <Textarea
                      rows={2}
                      value={amendStatement}
                      onChange={(e) => setAmendStatement(e.target.value)}
                    />
                    <Input
                      value={amendRationale}
                      onChange={(e) => setAmendRationale(e.target.value)}
                      placeholder="Обновлённое обоснование"
                      className="touch-target"
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select
                        value={amendCertainty}
                        onChange={(e) => setAmendCertainty(e.target.value as CertaintyStatus)}
                        className="touch-target rounded-md border border-input bg-background px-3 text-sm text-foreground"
                      >
                        <option value="KNOWN">KNOWN</option>
                        <option value="APPROXIMATE">APPROXIMATE</option>
                        <option value="UNKNOWN">UNKNOWN</option>
                      </select>
                      <Input
                        value={amendReason}
                        onChange={(e) => setAmendReason(e.target.value)}
                        placeholder="Причина ревизии (обязательно)"
                        className="touch-target"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" className="touch-target">
                        Сохранить ревизию
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="touch-target"
                        onClick={() => setAmendingId(null)}
                      >
                        Отмена
                      </Button>
                    </div>
                  </form>
                )}

                {fact.history.length > 0 && (
                  <details className="rounded border border-border bg-background/50 p-2 text-xs">
                    <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground">
                      <History className="h-3.5 w-3.5" />
                      История ревизий ({fact.history.length})
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {fact.history.map((rev) => (
                        <li key={rev.version} className="border-l-2 border-border pl-2">
                          <span className="mono-code text-[11px] text-muted-foreground">
                            v{rev.version} · {rev.inGameDate} · {rev.previousCertainty}
                          </span>
                          <p className="text-foreground line-through opacity-75">
                            {rev.previousStatement}
                          </p>
                          <p className="text-muted-foreground">Причина: {rev.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}