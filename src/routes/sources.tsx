import { createFileRoute } from "@tanstack/react-router";
import { FileUp, Plus } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { CertaintyBadge, SourceTypeBadge } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SourceDocument } from "@/domain/types";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Источники — Obsidian Control" },
      {
        name: "description",
        content:
          "Раздельное хранение управляющего документа, хроники канона мира и досье персонажа.",
      },
      { property: "og:title", content: "Источники — Obsidian Control" },
      {
        property: "og:description",
        content:
          "Раздельное хранение управляющего документа, хроники канона мира и досье персонажа.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  const { sources, attachSourceContent, addSupplementalSource } = useObsidianStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftOrigin, setDraftOrigin] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftFileName, setDraftFileName] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newOrigin, setNewOrigin] = useState("");
  const [newContent, setNewContent] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  function openEditor(src: SourceDocument) {
    setEditingId(src.id);
    setDraftContent(src.content);
    setDraftOrigin(src.originLabel);
    setDraftNotes(src.notes);
    setDraftFileName(src.fileName);
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setDraftFileName(file.name);
    setDraftContent(text);
    setDraftOrigin(`Загруженный файл: ${file.name}`);
    toast.info(`Прочитан файл ${file.name} (${text.length} симв.). Нажмите «Сохранить источник».`);
  }

  function handleSaveSource(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const res = attachSourceContent(editingId, {
      fileName: draftFileName,
      content: draftContent,
      originLabel: draftOrigin,
      notes: draftNotes,
    });
    if (res.ok) {
      toast.success("Источник сохранён и проверен обратным чтением.");
      setEditingId(null);
    } else {
      toast.error(res.error);
    }
  }

  function handleAddSupplemental(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Укажите название дополнительного источника.");
      return;
    }
    const res = addSupplementalSource({
      title: newTitle,
      originLabel: newOrigin || "Добавлено вручную",
      content: newContent,
      fileName: null,
      notes: "",
    });
    if (res.ok) {
      toast.success("Дополнительный источник добавлен.");
      setNewTitle("");
      setNewOrigin("");
      setNewContent("");
      setShowNewForm(false);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">Источники (Provenance)</h1>
          <p className="text-xs text-muted-foreground">
            Три раздельных типа документов: управляющий документ, канон мира и отдельный лист
            персонажа. Содержимое не выдумывается; загрузка файла не запускает кампанию.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="touch-target"
          onClick={() => setShowNewForm((v) => !v)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Доп. источник
        </Button>
      </header>

      {showNewForm && (
        <form onSubmit={handleAddSupplemental} className="panel-surface space-y-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">Новый дополнительный источник</h2>
          <div className="space-y-1.5">
            <Label htmlFor="sup-title">Название</Label>
            <Input
              id="sup-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Например: Заметки мастера о регионе"
              className="touch-target"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-origin">Происхождение / ссылка</Label>
            <Input
              id="sup-origin"
              value={newOrigin}
              onChange={(e) => setNewOrigin(e.target.value)}
              placeholder="Откуда получен документ"
              className="touch-target"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-content">Исходный текст (необязательно)</Label>
            <Textarea
              id="sup-content"
              rows={4}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Вставьте оригинальный текст без пересказа..."
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="touch-target">
              Сохранить
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="touch-target"
              onClick={() => setShowNewForm(false)}
            >
              Отмена
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {sources.map((src) => {
          const isEditing = editingId === src.id;
          return (
            <article key={src.id} className="panel-surface space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{src.title}</h2>
                    <SourceTypeBadge type={src.type} />
                    <CertaintyBadge status={src.certainty} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Контур: <span className="mono-code text-foreground">{src.targetPartition}</span>{" "}
                    · Происхождение: {src.originLabel}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="touch-target"
                  onClick={() => (isEditing ? setEditingId(null) : openEditor(src))}
                >
                  <FileUp className="mr-1.5 h-4 w-4" />
                  {src.contentStatus === "ATTACHED" ? "Обновить текст" : "Загрузить файл / текст"}
                </Button>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Статус:{" "}
                  <strong className="text-foreground">
                    {src.contentStatus === "ATTACHED"
                      ? `Прикреплён (${src.content.length} симв.)`
                      : "Файл не загружен (содержимое не выдумано)"}
                  </strong>
                </span>
                <span className="mono-code">SHA/FNV: {src.checksum}</span>
                {src.fileName && <span className="mono-code">Файл: {src.fileName}</span>}
              </div>

              {src.notes && <p className="text-xs text-muted-foreground">{src.notes}</p>}

              {src.contentStatus === "ATTACHED" && !isEditing && (
                <details className="rounded border border-border bg-background/60 p-2.5 text-xs">
                  <summary className="cursor-pointer font-medium text-foreground">
                    Показать сохранённый исходный текст ({src.content.length} симв.)
                  </summary>
                  <pre className="mono-code mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {src.content}
                  </pre>
                </details>
              )}

              {isEditing && (
                <form onSubmit={handleSaveSource} className="space-y-3 border-t border-border pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`file-${src.id}`}>
                      Загрузить текстовый файл (.txt, .md, .json)
                    </Label>
                    <Input
                      id={`file-${src.id}`}
                      type="file"
                      accept=".txt,.md,.json,.csv"
                      onChange={handleFileUpload}
                      className="touch-target"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`origin-${src.id}`}>Происхождение (Provenance)</Label>
                    <Input
                      id={`origin-${src.id}`}
                      value={draftOrigin}
                      onChange={(e) => setDraftOrigin(e.target.value)}
                      className="touch-target"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`content-${src.id}`}>Содержимое документа</Label>
                    <Textarea
                      id={`content-${src.id}`}
                      rows={6}
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      placeholder="Вставьте оригинальный текст документа или выберите файл выше..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`notes-${src.id}`}>Примечания</Label>
                    <Input
                      id={`notes-${src.id}`}
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      className="touch-target"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" className="touch-target">
                      Сохранить источник
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="touch-target"
                      onClick={() => setEditingId(null)}
                    >
                      Отмена
                    </Button>
                  </div>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}