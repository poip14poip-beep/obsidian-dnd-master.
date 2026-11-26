import { createFileRoute } from "@tanstack/react-router";
import { FileUp, Plus } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { readSupabaseEnv } from "@/lib/supabase-auth";

import { CertaintyBadge, SourceTypeBadge } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SourceDocument } from "@/domain/types";
import { extractDocxText } from "@/domain/docx-text";
import { processSourceContent } from "@/domain/source-processing";
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
  const { sources, attachSourceContent, addSupplementalSource, verifySource, setSourceContextEnabled } = useObsidianStore();
  const { session } = useAuth();
  const [vaultBusy, setVaultBusy] = useState<"OBSIDIAN_MASTER_PROMPT" | "SRD_5_2_1" | "EKDRASIL_WORLD_BIBLE" | null>(null);
  const [vaultStatus, setVaultStatus] = useState<Record<string, string>>({});
  async function uploadMasterDocument(kind: "OBSIDIAN_MASTER_PROMPT" | "SRD_5_2_1" | "EKDRASIL_WORLD_BIBLE", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || vaultBusy) return;
    const env = readSupabaseEnv();
    if (!session?.access_token || !env.ok) {
      toast.error("Для загрузки служебных документов требуется активная сессия Supabase.");
      event.target.value = "";
      return;
    }
    setVaultBusy(kind);
    try {
      if (file.name.toLowerCase().endsWith(".pdf")) throw new Error("PDF пока не поддерживается. Загрузи текстовую версию .txt/.md.");
      const content = file.name.toLowerCase().endsWith(".docx") ? await extractDocxText(file) : await file.text();
      if (!content.trim()) throw new Error("Файл пуст или текст не удалось извлечь.");
      const response = await fetch(env.config.url + "/functions/v1/obsidian-gm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token, apikey: env.config.publishableKey },
        body: JSON.stringify({ operation: "STORE_GM_SOURCE", sourceKind: kind, title: file.name, content }),
      });
      const payload = await response.json().catch(() => null) as { stored?: boolean; source?: { sha256?: string; version?: number }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.stored) throw new Error(payload?.error?.message ?? "Сервер не подтвердил сохранение.");
      const version = String(payload.source?.version ?? "UNKNOWN");
      const hash = payload.source?.sha256 ?? "UNKNOWN";
      setVaultStatus((current) => ({ ...current, [kind]: file.name + " · версия " + version + " · SHA-256 " + hash.slice(0, 12) }));
      toast.success(kind === "OBSIDIAN_MASTER_PROMPT" ? "ОБСИДИАН 4.1 сохранён в постоянном ядре мастера." : kind === "SRD_5_2_1" ? "SRD 5.2.1 сохранён в постоянном ядре мастера." : "Хроника Экдрасиля сохранена в постоянной библии мира.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить служебный документ.");
    } finally {
      setVaultBusy(null);
      event.target.value = "";
    }
  }
  const playerVisibleSources = sources.filter((source) => source.playerVisible !== false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftOrigin, setDraftOrigin] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftFileName, setDraftFileName] = useState<string | null>(null);
  const [savingSource, setSavingSource] = useState(false);

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
    let text: string;
    try {
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        throw new Error("PDF не преобразуется в текст в текущей версии приложения. Загрузи .txt или .md с извлечённым текстом; встроенная проверенная справка SRD 5.2.1 уже доступна мастеру.");
      }
      text = file.name.toLowerCase().endsWith(".docx") ? await extractDocxText(file) : await file.text();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось прочитать файл.");
      e.target.value = "";
      return;
    }
    setDraftFileName(file.name);
    setDraftContent(text);
    setDraftOrigin(`Загруженный файл: ${file.name}`);
    toast.info(`Прочитан файл ${file.name} (${text.length} симв.). Нажмите «Сохранить источник».`);
  }

  async function handleSaveSource(e: FormEvent) {
    e.preventDefault();
    if (!editingId || savingSource) return;
    const source = sources.find((item) => item.id === editingId);
    if (!source) {
      toast.error("Источник больше не найден. Обновите страницу и проверьте состояние.");
      return;
    }
    setSavingSource(true);
    try {
      const processed = await processSourceContent(
        { id: source.id, title: source.title, type: source.type, fileName: draftFileName },
        draftContent,
      );
      const res = attachSourceContent(editingId, {
        fileName: draftFileName,
        content: draftContent,
        originLabel: draftOrigin,
        notes: draftNotes,
        processing: processed.processing,
        canonSections: processed.canonSections,
        dateMentions: processed.dateMentions,
      });
      if (res.ok) {
        toast.success(`Источник обработан: SHA-256 подтверждён, ${processed.processing.lineCount} строк, ${processed.processing.sectionCount} разделов.`);
        setEditingId(null);
      } else {
        toast.error(res.error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обработать источник.");
    } finally {
      setSavingSource(false);
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
    <div className="space-y-4"><div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Закрытое хранилище мастера</h2>
        <p className="text-xs text-muted-foreground">Это постоянное ядро мастера Экдрасиля, общее для всех кампаний. Документы хранятся на сервере отдельно от кампаний и персонажей; загрузить их нужно один раз. В игровых ходах сервер подключает правила и релевантные фрагменты мировой хроники автоматически.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          <span>ОБСИДИАН 4.1 · полный управляющий промт</span>
          <input type="file" accept=".md,.txt,.docx" disabled={!session || vaultBusy !== null} onChange={(event) => void uploadMasterDocument("OBSIDIAN_MASTER_PROMPT", event)} className="block w-full text-xs" />
          <span className="block text-[11px] text-muted-foreground">MD, TXT или DOCX. Загружается один раз и далее подключается сервером.</span>
          {vaultStatus["OBSIDIAN_MASTER_PROMPT"] && <span className="block text-[11px] text-emerald-500">{vaultStatus["OBSIDIAN_MASTER_PROMPT"]}</span>}
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          <span>SRD 5.2.1 · правила D&D 2024</span>
          <input type="file" accept=".md,.txt,.docx" disabled={!session || vaultBusy !== null} onChange={(event) => void uploadMasterDocument("SRD_5_2_1", event)} className="block w-full text-xs" />
          <span className="block text-[11px] text-muted-foreground">Нужна текстовая версия MD/TXT/DOCX; PDF пока не поддерживается.</span>
          {vaultStatus["SRD_5_2_1"] && <span className="block text-[11px] text-emerald-500">{vaultStatus["SRD_5_2_1"]}</span>}
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          <span>Хроника Экдрасиля · постоянный лор мира</span>
          <input type="file" accept=".md,.txt,.docx" disabled={!session || vaultBusy !== null} onChange={(event) => void uploadMasterDocument("EKDRASIL_WORLD_BIBLE", event)} className="block w-full text-xs" />
          <span className="block text-[11px] text-muted-foreground">Подключается ко всем кампаниям Экдрасиля. Персонажи и события кампаний сюда не попадают.</span>
          {vaultStatus["EKDRASIL_WORLD_BIBLE"] && <span className="block text-[11px] text-emerald-500">{vaultStatus["EKDRASIL_WORLD_BIBLE"]}</span>}
        </label>
      </div>
      {vaultBusy && <p className="text-xs text-muted-foreground">Сохраняю документ в постоянной базе мастера…</p>}
    </div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">Служебные источники мастера</h1>
          <p className="text-xs text-muted-foreground">
            Постоянные документы мастера (ОБСИДИАН 4.1, SRD 5.2.1 и хроника Экдрасиля) не относятся к отдельной кампании и не загружаются заново при её создании. Лист персонажа и изменяемое состояние мира остаются отдельными данными прохождения.
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
        {playerVisibleSources.map((src) => {
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
                <span className="mono-code">Хеш записи: {src.checksum}</span>
                <span className="mono-code">SHA-256: {src.processing?.sha256 ?? "НЕ ПРОВЕРЕН"}</span>
                {src.fileName && <span className="mono-code">Файл: {src.fileName}</span>}
                <span>Обработка: <strong className="text-foreground">{src.processing?.status === "PROCESSED" ? "ПРОВЕРЕН" : "НЕ ОБРАБОТАН"}</strong></span>
                {src.processing?.status === "PROCESSED" && <span>{src.processing.lineCount} строк · {src.processing.sectionCount} разделов · {src.processing.chunkCount} фрагментов</span>}
                {src.processing?.dateCandidateCount ? <span>Кандидатов дат: {src.processing.dateCandidateCount} (не утверждены)</span> : null}
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background/50 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    Проверка содержимого: {src.reviewStatus === "VERIFIED" ? "ПОДТВЕРЖДЁН ПОЛЬЗОВАТЕЛЕМ" : "НЕ ПРОВЕРЕНО"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Загрузка и SHA-256 не означают, что содержимое сверено с оригиналом.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="touch-target"
                  disabled={src.contentStatus !== "ATTACHED" || src.processing?.status !== "PROCESSED" || src.reviewStatus === "VERIFIED"}
                  onClick={() => {
                    const result = verifySource(src.id);
                    if (result.ok) toast.success("Содержимое источника отмечено как проверенное.");
                    else toast.error(result.error);
                  }}
                >
                  Подтвердить содержимое
                </Button>
                <label className="flex min-h-11 items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={src.contextEnabled === true}
                    disabled={src.contentStatus !== "ATTACHED" || src.processing?.status !== "PROCESSED" || src.reviewStatus !== "VERIFIED"}
                    onCheckedChange={(checked) => {
                      const result = setSourceContextEnabled(src.id, checked === true);
                      if (result.ok) toast.success(checked ? "Источник включён в контекст ИИ." : "Источник исключён из контекста ИИ.");
                      else toast.error(result.error);
                    }}
                  />
                  Включить в контекст ИИ
                </label>
              </div>

              {src.notes && <p className="text-xs text-muted-foreground">{src.notes}</p>}
              {src.processing?.warnings.map((warning, index) => <p key={index} className="text-xs text-status-approx">Предупреждение обработки: {warning}</p>)}

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
                      Загрузить текстовый файл (.txt, .md, .json, .docx)
                    </Label>
                    <Input
                      id={`file-${src.id}`}
                      type="file"
                      accept=".txt,.md,.json,.csv,.docx"
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