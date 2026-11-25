import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CertaintyBadge } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CertaintyStatus } from "@/domain/types";
import { extractDossierBasics } from "@/domain/dossier-parser";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/character")({
  head: () => ({
    meta: [
      { title: "Персонаж — Obsidian Control" },
      {
        name: "description",
        content: "Изолированный лист персонажа PLAYER_CHARACTER_STATE: HP, ресурсы, инвентарь.",
      },
      { property: "og:title", content: "Персонаж — Obsidian Control" },
      {
        property: "og:description",
        content: "Изолированный лист персонажа PLAYER_CHARACTER_STATE: HP, ресурсы, инвентарь.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CharacterPage,
});

function parseOptionalNonNegInt(raw: string): number | null | "INVALID" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < 0) return "INVALID";
  return num;
}

function CharacterPage() {
  const {
    sources,
    character,
    updatePlayerCharacter,
    addCharacterResource,
    updateCharacterResource,
    addInventoryItem,
    removeInventoryItem,
  } = useObsidianStore();

  const [name, setName] = useState(character.name);
  const [speciesAndClass, setSpeciesAndClass] = useState(character.speciesAndClass);
  const [levelStr, setLevelStr] = useState(character.level !== null ? String(character.level) : "");
  const [hpCurrentStr, setHpCurrentStr] = useState(
    character.hpCurrent !== null ? String(character.hpCurrent) : "",
  );
  const [hpMaxStr, setHpMaxStr] = useState(character.hpMax !== null ? String(character.hpMax) : "");
  const [hpTempStr, setHpTempStr] = useState(
    character.hpTemp !== null ? String(character.hpTemp) : "",
  );
  const [acStr, setAcStr] = useState(
    character.armorClass !== null ? String(character.armorClass) : "",
  );
  const [statsCertainty, setStatsCertainty] = useState<CertaintyStatus>(character.statsCertainty);
  const [notes, setNotes] = useState(character.notes);
  const [dossierImportSummary, setDossierImportSummary] = useState<string[]>([]);

  const [resName, setResName] = useState("");
  const [resCur, setResCur] = useState("");
  const [resMax, setResMax] = useState("");
  const [resRec, setResRec] = useState("Долгий отдых");

  const [invName, setInvName] = useState("");
  const [invQty, setInvQty] = useState("1");
  const [invNotes, setInvNotes] = useState("");

  useEffect(() => {
    setName(character.name);
    setSpeciesAndClass(character.speciesAndClass);
    setLevelStr(character.level !== null ? String(character.level) : "");
    setHpCurrentStr(character.hpCurrent !== null ? String(character.hpCurrent) : "");
    setHpMaxStr(character.hpMax !== null ? String(character.hpMax) : "");
    setHpTempStr(character.hpTemp !== null ? String(character.hpTemp) : "");
    setAcStr(character.armorClass !== null ? String(character.armorClass) : "");
    setStatsCertainty(character.statsCertainty);
    setNotes(character.notes);
  }, [character]);

  const dossier = sources.find((s) => s.id === character.sourceDossierId);

  function handleImportDossier() {
    if (!dossier || dossier.contentStatus !== "ATTACHED") {
      toast.error("Сначала загрузите досье персонажа в разделе «Источники».");
      return;
    }
    const extracted = extractDossierBasics(dossier.content);
    if (extracted.evidence.length === 0) {
      toast.error("В досье не найдена распознаваемая сводка характеристик. Заполните лист вручную.");
      return;
    }
    if (extracted.name) setName(extracted.name);
    if (extracted.speciesAndClass) setSpeciesAndClass(extracted.speciesAndClass);
    if (extracted.level !== null) setLevelStr(String(extracted.level));
    if (extracted.hitPointMaximum !== null) setHpMaxStr(String(extracted.hitPointMaximum));
    if (extracted.armorClass !== null) setAcStr(String(extracted.armorClass));
    setStatsCertainty("KNOWN");
    setDossierImportSummary(extracted.evidence);
    toast.success("Подтянуты только явно найденные значения. Текущие HP, инвентарь и неизвестные поля не заполнены.");
  }

  function handleSaveSheet(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Укажите имя персонажа.");
      return;
    }
    const level = parseOptionalNonNegInt(levelStr);
    const hpCurrent = parseOptionalNonNegInt(hpCurrentStr);
    const hpMax = parseOptionalNonNegInt(hpMaxStr);
    const hpTemp = parseOptionalNonNegInt(hpTempStr);
    const armorClass = parseOptionalNonNegInt(acStr);

    if (
      level === "INVALID" ||
      hpCurrent === "INVALID" ||
      hpMax === "INVALID" ||
      hpTemp === "INVALID" ||
      armorClass === "INVALID"
    ) {
      toast.error(
        "Числовые характеристики должны быть целыми неотрицательными или пустыми (UNKNOWN).",
      );
      return;
    }
    if (level !== null && (level < 1 || level > 20)) {
      toast.error("Уровень персонажа в D&D 5e должен быть от 1 до 20.");
      return;
    }
    const res = updatePlayerCharacter({
      name: name.trim(),
      nameCertainty: name.trim() === "UNKNOWN" ? "UNKNOWN" : "KNOWN",
      speciesAndClass: speciesAndClass.trim() || "UNKNOWN",
      level,
      hpCurrent,
      hpMax,
      hpTemp,
      armorClass,
      statsCertainty,
      notes,
    });
    if (res.ok) {
      toast.success("PLAYER_CHARACTER_STATE сохранён в изолированном контуре.");
    } else {
      toast.error(res.error);
    }
  }

  function handleAddResource(e: FormEvent) {
    e.preventDefault();
    if (!resName.trim()) {
      toast.error("Укажите название ресурса (например: Ячейки 1 круга).");
      return;
    }
    const cur = parseOptionalNonNegInt(resCur);
    const max = parseOptionalNonNegInt(resMax);
    if (cur === "INVALID" || max === "INVALID") {
      toast.error("Значения ресурса должны быть неотрицательными целыми числами.");
      return;
    }
    const res = addCharacterResource({
      name: resName.trim(),
      current: cur,
      max,
      certainty: cur !== null ? "KNOWN" : "UNKNOWN",
      recovery: resRec.trim() || "UNKNOWN",
    });
    if (res.ok) {
      toast.success("Ресурс добавлен в лист персонажа.");
      setResName("");
      setResCur("");
      setResMax("");
    } else {
      toast.error(res.error);
    }
  }

  function handleAddInventory(e: FormEvent) {
    e.preventDefault();
    const qty = Number(invQty);
    if (!invName.trim() || !Number.isInteger(qty) || qty < 1) {
      toast.error("Укажите название предмета и положительное количество.");
      return;
    }
    const res = addInventoryItem({
      name: invName.trim(),
      quantity: qty,
      notes: invNotes.trim(),
      certainty: "KNOWN",
    });
    if (res.ok) {
      toast.success("Предмет добавлен в инвентарь.");
      setInvName("");
      setInvQty("1");
      setInvNotes("");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-foreground">Лист персонажа</h1>
          <span className="mono-code rounded border border-layer-player/40 bg-layer-player/10 px-2 py-0.5 text-[11px] text-layer-player">
            PLAYER_CHARACTER_STATE · v{character.stateVersion}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Хранится в отдельном контуре (не вложен в CAMPAIGN_STATE). Источник досье:{" "}
          <span className="text-foreground">{dossier?.title ?? character.sourceDossierId}</span> (
          {dossier?.contentStatus === "ATTACHED" ? "файл прикреплён" : "файл не загружен"}).
        </p>
      </header>

      <form onSubmit={handleSaveSheet} className="panel-surface space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Основные параметры</h2>
          <CertaintyBadge status={character.statsCertainty} />
        </div>
        {dossier?.contentStatus === "ATTACHED" && <div className="space-y-2 rounded border border-primary/30 bg-primary/5 p-3"><p className="text-xs text-muted-foreground">В досье обнаружены исходные данные. Импорт не меняет канон мира и не запускает кампанию.</p><Button type="button" variant="secondary" className="touch-target" onClick={handleImportDossier}>Извлечь данные из досье</Button>{dossierImportSummary.length > 0 && <ul className="space-y-1 text-xs text-muted-foreground">{dossierImportSummary.map((item) => <li key={item}>· {item}</li>)}</ul>}</div>}\n        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pc-name">Имя персонажа</Label>
            <Input
              id="pc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="touch-target"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-class">Вид и класс (или UNKNOWN)</Label>
            <Input
              id="pc-class"
              value={speciesAndClass}
              onChange={(e) => setSpeciesAndClass(e.target.value)}
              className="touch-target"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-lvl">Уровень (1–20; 21 только с эпическим домашним правилом)</Label>
            <Input
              id="pc-lvl"
              inputMode="numeric"
              value={levelStr}
              onChange={(e) => setLevelStr(e.target.value)}
              placeholder="UNKNOWN"
              className="touch-target mono-code"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-cert">Уверенность параметров</Label>
            <select
              id="pc-cert"
              value={statsCertainty}
              onChange={(e) => setStatsCertainty(e.target.value as CertaintyStatus)}
              className="touch-target w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="UNKNOWN">UNKNOWN</option>
              <option value="APPROXIMATE">APPROXIMATE</option>
              <option value="KNOWN">KNOWN</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="pc-hp">Текущие HP</Label>
            <Input
              id="pc-hp"
              inputMode="numeric"
              value={hpCurrentStr}
              onChange={(e) => setHpCurrentStr(e.target.value)}
              placeholder="UNKNOWN"
              className="touch-target mono-code"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pc-hp-max">Макс. HP</Label>
            <Input
              id="pc-hp-max"
              inputMode="numeric"
              value={hpMaxStr}
              onChange={(e) => setHpMaxStr(e.target.value)}
              placeholder="UNKNOWN"
              className="touch-target mono-code"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pc-hp-tmp">Врем. HP</Label>
            <Input
              id="pc-hp-tmp"
              inputMode="numeric"
              value={hpTempStr}
              onChange={(e) => setHpTempStr(e.target.value)}
              placeholder="0"
              className="touch-target mono-code"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pc-ac">КД (AC)</Label>
            <Input
              id="pc-ac"
              inputMode="numeric"
              value={acStr}
              onChange={(e) => setAcStr(e.target.value)}
              placeholder="UNKNOWN"
              className="touch-target mono-code"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pc-notes">Заметки по листу персонажа</Label>
          <Textarea
            id="pc-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Особенности, состояния, пометки из досье Лии Вейн..."
          />
        </div>

        <Button type="submit" className="touch-target w-full sm:w-auto">
          Сохранить лист персонажа
        </Button>
      </form>

      {/* Resources */}
      <section className="panel-surface space-y-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Ресурсы и ячейки ({character.resources.length})
        </h2>
        <form onSubmit={handleAddResource} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Input
            value={resName}
            onChange={(e) => setResName(e.target.value)}
            placeholder="Название ресурса"
            className="touch-target sm:col-span-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              inputMode="numeric"
              value={resCur}
              onChange={(e) => setResCur(e.target.value)}
              placeholder="Тек."
              className="touch-target mono-code"
            />
            <Input
              inputMode="numeric"
              value={resMax}
              onChange={(e) => setResMax(e.target.value)}
              placeholder="Макс."
              className="touch-target mono-code"
            />
          </div>
          <Button type="submit" variant="secondary" className="touch-target">
            <Plus className="mr-1 h-4 w-4" />
            Ресурс
          </Button>
        </form>
        {character.resources.length > 0 && (
          <div className="space-y-2">
            {character.resources.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/60 p-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">Восстановление: {r.recovery}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="touch-target"
                    onClick={() => updateCharacterResource(r.id, Math.max(0, (r.current ?? 0) - 1))}
                  >
                    −1
                  </Button>
                  <span className="mono-code min-w-14 text-center text-sm font-semibold">
                    {r.current ?? "?"}/{r.max ?? "?"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="touch-target"
                    onClick={() =>
                      updateCharacterResource(
                        r.id,
                        r.max !== null
                          ? Math.min(r.max, (r.current ?? 0) + 1)
                          : (r.current ?? 0) + 1,
                      )
                    }
                  >
                    +1
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Inventory */}
      <section className="panel-surface space-y-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Инвентарь ({character.inventory.length})
        </h2>
        <form onSubmit={handleAddInventory} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Input
            value={invName}
            onChange={(e) => setInvName(e.target.value)}
            placeholder="Предмет"
            className="touch-target sm:col-span-2"
          />
          <Input
            inputMode="numeric"
            value={invQty}
            onChange={(e) => setInvQty(e.target.value)}
            placeholder="Кол-во"
            className="touch-target mono-code"
          />
          <Button type="submit" variant="secondary" className="touch-target">
            <Plus className="mr-1 h-4 w-4" />
            Добавить
          </Button>
        </form>
        {character.inventory.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Инвентарь пуст (не заполняется вымышленно).
          </p>
        ) : (
          <ul className="space-y-2">
            {character.inventory.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">{item.name}</span>
                  <span className="mono-code ml-2 text-xs text-primary">×{item.quantity}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="touch-target text-muted-foreground hover:text-destructive"
                  aria-label={`Удалить ${item.name}`}
                  onClick={() => removeInventoryItem(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}