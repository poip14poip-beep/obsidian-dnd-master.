import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { COLLECTION_NAMES } from "@/domain/integrity";
import { STORAGE_KEYS } from "@/domain/storage";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Проверка/аудит — Obsidian Control" },
      {
        name: "description",
        content: "Сверка целостности контуров данных, обратное чтение и журнал аудита.",
      },
      { property: "og:title", content: "Проверка/аудит — Obsidian Control" },
      {
        property: "og:description",
        content: "Сверка целостности контуров данных, обратное чтение и журнал аудита.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { auditLog, lastIntegrityReport, lastStorageError, runAuditNow } = useObsidianStore();

  function handleRunCheck() {
    const report = runAuditNow();
    if (report.ok) {
      toast.success("Проверка обратного чтения и целостности пройдена (все проверки OK).");
    } else {
      toast.error("Обнаружены нарушения целостности! Проверьте отчёт ниже.");
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">Проверка / аудит</h1>
          <p className="text-xs text-muted-foreground">
            Перечитывает все разделённые контуры из хранилища и сверяет инварианты ОБСИДИАН 4.1.
          </p>
        </div>
        <Button type="button" className="touch-target" onClick={handleRunCheck}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Проверить сейчас
        </Button>
      </header>

      <div className="panel-surface flex items-start gap-2.5 border-status-approx/40 bg-status-approx-bg/30 p-3.5 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-approx" />
        <p>
          <strong className="text-foreground">Граница гарантий (этап 1):</strong> данные сохраняются
          локально в браузере (localStorage) с обязательным обратным чтением и сверкой контрольных
          сумм. Реальной серверной транзакционности и абсолютной защиты от потери данных на этом
          этапе нет — регулярно сохраняйте резервную копию JSON в разделе «Настройки кампании».
        </p>
      </div>

      {lastStorageError && (
        <div
          role="alert"
          className="panel-surface border-status-danger/60 bg-status-danger-bg/50 p-3.5 text-sm text-status-danger"
        >
          Последняя ошибка хранилища: {lastStorageError}
        </div>
      )}

      {lastIntegrityReport && (
        <section className="panel-surface space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Отчёт целостности:{" "}
              <span
                className={lastIntegrityReport.ok ? "text-status-verified" : "text-status-danger"}
              >
                {lastIntegrityReport.ok ? "ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : "ЕСТЬ НАРУШЕНИЯ"}
              </span>
            </h2>
            <span className="mono-code text-[11px] text-muted-foreground">
              {new Date(lastIntegrityReport.checkedAt).toLocaleString("ru-RU")}
            </span>
          </div>

          <ul className="space-y-2">
            {lastIntegrityReport.checks.map((chk) => (
              <li
                key={chk.id}
                className="flex items-start gap-2.5 rounded border border-border bg-background/60 p-3 text-xs"
              >
                {chk.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-verified" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-danger" />
                )}
                <div>
                  <p className="font-semibold text-foreground">{chk.label}</p>
                  <p className="mt-0.5 text-muted-foreground">{chk.details}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
            {COLLECTION_NAMES.map((name) => (
              <ChecksumRow
                key={name}
                label={name}
                storageKey={STORAGE_KEYS[name]}
                checksum={lastIntegrityReport.checksums[name]}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Журнал аудита ({auditLog.entries.length})
        </h2>
        {auditLog.entries.length === 0 ? (
          <div className="panel-surface p-5 text-center text-xs text-muted-foreground">
            Записей аудита пока нет.
          </div>
        ) : (
          <ul className="space-y-2">
            {[...auditLog.entries].reverse().map((entry) => (
              <li key={entry.id} className="panel-surface space-y-1 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="mono-code font-semibold text-primary">{entry.action}</span>
                  <span className="mono-code text-[11px] text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString("ru-RU")}
                  </span>
                </div>
                <p className="text-foreground">{entry.details}</p>
                <p className="mono-code text-[11px] text-muted-foreground">
                  CAMPAIGN v{entry.campaignVersion} · PC v{entry.characterVersion}
                  {entry.turnNumber !== null ? ` · Ход #${entry.turnNumber}` : ""} ·{" "}
                  {entry.checksumSnapshot}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChecksumRow({
  label,
  storageKey,
  checksum,
}: {
  label: string;
  storageKey: string;
  checksum: string;
}) {
  return (
    <div className="rounded border border-border bg-background/60 p-2.5 text-xs">
      <p className="mono-code font-semibold text-foreground">{label}</p>
      <p className="mono-code truncate text-[11px] text-muted-foreground">{storageKey}</p>
      <p className="mono-code mt-1 text-[11px] text-primary">CHK: {checksum}</p>
    </div>
  );
}