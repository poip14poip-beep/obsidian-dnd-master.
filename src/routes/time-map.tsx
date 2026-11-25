import { createFileRoute } from "@tanstack/react-router";
import { Clock, MapPin, Plus, Route as RouteIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CertaintyBadge } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SOURCE_IDS } from "@/domain/defaults";
import type { CertaintyStatus } from "@/domain/types";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/time-map")({
  head: () => ({
    meta: [
      { title: "Время и карта — Obsidian Control" },
      {
        name: "description",
        content: "Хронология, отложенные события, реестр локаций и маршруты перемещения.",
      },
      { property: "og:title", content: "Время и карта — Obsidian Control" },
      {
        property: "og:description",
        content: "Хронология, отложенные события, реестр локаций и маршруты перемещения.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TimeMapPage,
});

function TimeMapPage() {
  const {
    worldState,
    locations,
    timelineEvents,
    addLocation,
    addTravelRoute,
    addDelayedEvent,
    updateDelayedEventStatus,
  } = useObsidianStore();

  const [locName, setLocName] = useState("");
  const [locRegion, setLocRegion] = useState("UNKNOWN");
  const [locDesc, setLocDesc] = useState("");
  const [locCert, setLocCert] = useState<CertaintyStatus>("KNOWN");

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [distLabel, setDistLabel] = useState("");
  const [hoursStr, setHoursStr] = useState("");
  const [routeCert, setRouteCert] = useState<CertaintyStatus>("APPROXIMATE");

  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evConsequence, setEvConsequence] = useState("");
  const [evCert, setEvCert] = useState<CertaintyStatus>("APPROXIMATE");

  function handleAddLocation(e: FormEvent) {
    e.preventDefault();
    if (!locName.trim()) {
      toast.error("Укажите название локации.");
      return;
    }
    const res = addLocation({
      name: locName.trim(),
      region: locRegion.trim() || "UNKNOWN",
      description: locDesc.trim(),
      certainty: locCert,
      sourceId: DEFAULT_SOURCE_IDS.CANON,
    });
    if (res.ok) {
      toast.success("Локация добавлена в карту мира.");
      setLocName("");
      setLocDesc("");
    } else {
      toast.error(res.error);
    }
  }

  function handleAddRoute(e: FormEvent) {
    e.preventDefault();
    if (!fromId || !toId || fromId === toId) {
      toast.error("Выберите две разные локации для маршрута.");
      return;
    }
    const hours = hoursStr.trim() ? Number(hoursStr) : null;
    if (hours !== null && (!Number.isFinite(hours) || hours < 0)) {
      toast.error("Время пути в часах не может быть отрицательным.");
      return;
    }
    const res = addTravelRoute({
      fromLocationId: fromId,
      toLocationId: toId,
      distanceLabel: distLabel.trim() || "UNKNOWN",
      travelTimeHours: hours,
      certainty: routeCert,
      notes: "",
    });
    if (res.ok) {
      toast.success("Маршрут перемещения сохранён.");
      setDistLabel("");
      setHoursStr("");
    } else {
      toast.error(res.error);
    }
  }

  function handleAddEvent(e: FormEvent) {
    e.preventDefault();
    if (!evTitle.trim() || !evDate.trim()) {
      toast.error("Укажите название и дату срабатывания отложенного события.");
      return;
    }
    const res = addDelayedEvent({
      title: evTitle.trim(),
      triggerInGameDate: evDate.trim(),
      consequence: evConsequence.trim() || "UNKNOWN",
      status: "SCHEDULED",
      certainty: evCert,
      sourceId: "MANUAL_GM_ENTRY",
    });
    if (res.ok) {
      toast.success("Отложенное событие добавлено в хронологию.");
      setEvTitle("");
      setEvDate("");
      setEvConsequence("");
    } else {
      toast.error(res.error);
    }
  }

  const nameOf = (id: string) => locations.find((l) => l.id === id)?.name ?? "UNKNOWN";

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-foreground">Время и карта</h1>
        <p className="text-xs text-muted-foreground">
          Хронология, отложенные события, локации и расстояния/время переходов. Игровое время
          сдвигается только при commit игрового хода.
        </p>
      </header>

      <section className="panel-surface grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Текущая дата мира</p>
          <p className="mono-code mt-0.5 text-sm font-semibold text-primary">
            {worldState.currentInGameDate}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Прошло с момента старта</p>
          <p className="mono-code mt-0.5 text-sm font-semibold text-foreground">
            {Math.floor(worldState.elapsedMinutes / 60)} ч {worldState.elapsedMinutes % 60} мин
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Календарь</p>
          <p className="mono-code mt-0.5 text-sm font-medium text-foreground">
            {worldState.calendarSystem}
          </p>
        </div>
      </section>

      {/* Delayed Events */}
      <section className="panel-surface space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Отложенные события · timeline_events ({timelineEvents.length})
          </h2>
        </div>
        <form onSubmit={handleAddEvent} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            value={evTitle}
            onChange={(e) => setEvTitle(e.target.value)}
            placeholder="Событие"
            className="touch-target"
          />
          <Input
            value={evDate}
            onChange={(e) => setEvDate(e.target.value)}
            placeholder="Дата/срок срабатывания"
            className="touch-target"
          />
          <Input
            value={evConsequence}
            onChange={(e) => setEvConsequence(e.target.value)}
            placeholder="Ожидаемое последствие"
            className="touch-target"
          />
          <div className="flex gap-2">
            <select
              value={evCert}
              onChange={(e) => setEvCert(e.target.value as CertaintyStatus)}
              className="touch-target flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="KNOWN">KNOWN</option>
              <option value="APPROXIMATE">APPROXIMATE</option>
              <option value="UNKNOWN">UNKNOWN</option>
            </select>
            <Button type="submit" variant="secondary" className="touch-target">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </form>
        {timelineEvents.map((ev) => (
          <div
            key={ev.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background/60 p-2.5 text-xs"
          >
            <div>
              <p className="font-medium text-foreground">{ev.title}</p>
              <p className="text-muted-foreground">
                Срок: <span className="mono-code">{ev.triggerInGameDate}</span> · {ev.consequence}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <CertaintyBadge status={ev.certainty} />
              <select
                aria-label={`Статус события ${ev.title}`}
                value={ev.status}
                onChange={(e) =>
                  updateDelayedEventStatus(
                    ev.id,
                    e.target.value as "SCHEDULED" | "TRIGGERED" | "RESOLVED",
                  )
                }
                className="touch-target rounded border border-input bg-background px-2 text-xs text-foreground"
              >
                <option value="SCHEDULED">Запланировано</option>
                <option value="TRIGGERED">Сработало</option>
                <option value="RESOLVED">Закрыто</option>
              </select>
            </div>
          </div>
        ))}
      </section>

      {/* Locations */}
      <section className="panel-surface space-y-3 p-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Локации · locations ({locations.length})
          </h2>
        </div>
        <form onSubmit={handleAddLocation} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            value={locName}
            onChange={(e) => setLocName(e.target.value)}
            placeholder="Название локации"
            className="touch-target"
          />
          <Input
            value={locRegion}
            onChange={(e) => setLocRegion(e.target.value)}
            placeholder="Регион (или UNKNOWN)"
            className="touch-target"
          />
          <Input
            value={locDesc}
            onChange={(e) => setLocDesc(e.target.value)}
            placeholder="Краткое описание из канона"
            className="touch-target"
          />
          <div className="flex gap-2">
            <select
              value={locCert}
              onChange={(e) => setLocCert(e.target.value as CertaintyStatus)}
              className="touch-target flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="KNOWN">KNOWN</option>
              <option value="APPROXIMATE">APPROXIMATE</option>
              <option value="UNKNOWN">UNKNOWN</option>
            </select>
            <Button type="submit" variant="secondary" className="touch-target">
              <Plus className="mr-1 h-4 w-4" />
              Локация
            </Button>
          </div>
        </form>
        <div className="space-y-2">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-start justify-between gap-2 rounded border border-border bg-background/60 p-2.5 text-xs"
            >
              <div>
                <p className="font-semibold text-foreground">
                  {loc.name}{" "}
                  {worldState.currentLocationId === loc.id && (
                    <span className="mono-code ml-1 text-primary">[ТЕКУЩАЯ]</span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  Регион: {loc.region} {loc.description ? `· ${loc.description}` : ""}
                </p>
              </div>
              <CertaintyBadge status={loc.certainty} />
            </div>
          ))}
        </div>
      </section>

      {/* Travel routes */}
      <section className="panel-surface space-y-3 p-4">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Расстояния и переходы ({worldState.routes.length})
          </h2>
        </div>
        <form onSubmit={handleAddRoute} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rt-from">Откуда</Label>
            <select
              id="rt-from"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Выберите локацию</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rt-to">Куда</Label>
            <select
              id="rt-to"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Выберите локацию</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            value={distLabel}
            onChange={(e) => setDistLabel(e.target.value)}
            placeholder="Дистанция (напр. 18 миль / UNKNOWN)"
            className="touch-target"
          />
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              value={hoursStr}
              onChange={(e) => setHoursStr(e.target.value)}
              placeholder="Часов в пути"
              className="touch-target mono-code"
            />
            <select
              value={routeCert}
              onChange={(e) => setRouteCert(e.target.value as CertaintyStatus)}
              className="touch-target rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="KNOWN">KNOWN</option>
              <option value="APPROXIMATE">APPROX</option>
              <option value="UNKNOWN">UNKNOWN</option>
            </select>
            <Button type="submit" variant="secondary" className="touch-target">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </form>
        {worldState.routes.map((rt) => (
          <div
            key={rt.id}
            className="flex items-center justify-between gap-2 rounded border border-border bg-background/60 p-2.5 text-xs"
          >
            <span>
              <strong>{nameOf(rt.fromLocationId)}</strong> →{" "}
              <strong>{nameOf(rt.toLocationId)}</strong> · {rt.distanceLabel} ·{" "}
              <span className="mono-code">
                {rt.travelTimeHours !== null ? `${rt.travelTimeHours} ч` : "UNKNOWN"}
              </span>
            </span>
            <CertaintyBadge status={rt.certainty} />
          </div>
        ))}
      </section>
    </div>
  );
}