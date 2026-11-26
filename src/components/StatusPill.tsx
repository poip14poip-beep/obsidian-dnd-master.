import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import type { CertaintyStatus, EpistemicLayer, SourceType } from "@/domain/types";
import { cn } from "@/lib/utils";

const CERTAINTY_META: Record<CertaintyStatus, { label: string; className: string }> = {
  KNOWN: {
    label: "Подтверждено",
    className: "bg-status-known-bg text-status-known border-status-known/40",
  },
  APPROXIMATE: {
    label: "Приблизительно",
    className: "bg-status-approx-bg text-status-approx border-status-approx/40",
  },
  UNKNOWN: {
    label: "Неизвестно",
    className: "bg-status-unknown-bg text-status-unknown border-status-unknown/40",
  },
};

export function CertaintyBadge({
  status,
  className,
}: {
  status: CertaintyStatus;
  className?: string;
}) {
  const meta = CERTAINTY_META[status];
  return (
    <span
      className={cn(
        "mono-code inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

const LAYER_META: Record<EpistemicLayer, { label: string; className: string }> = {
  OBJECTIVE_TRUTH: {
    label: "Объективная истина",
    className: "border-layer-objective/40 text-layer-objective bg-layer-objective/10",
  },
  PLAYER_KNOWLEDGE: {
    label: "Знание персонажа",
    className: "border-layer-player/40 text-layer-player bg-layer-player/10",
  },
  NPC_KNOWLEDGE: {
    label: "Знание NPC",
    className: "border-layer-npc/40 text-layer-npc bg-layer-npc/10",
  },
  OUT_OF_GAME: {
    label: "Внеигровая (OOC)",
    className: "border-layer-ooc/40 text-layer-ooc bg-layer-ooc/10",
  },
};

export function LayerBadge({ layer }: { layer: EpistemicLayer }) {
  const meta = LAYER_META[layer];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  GOVERNING_DOC: "Управляющий документ",
  WORLD_CANON: "Канон мира",
  PLAYER_DOSSIER: "Лист персонажа",
  SUPPLEMENTAL: "Доп. источник",
};

export function SourceTypeBadge({ type }: { type: SourceType }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
      {SOURCE_TYPE_LABEL[type]}
    </span>
  );
}

export function SetupGateBanner({ confirmed }: { confirmed: boolean }) {
  if (confirmed) return null;
  return (
    <div className="panel-surface flex flex-col gap-3 border-status-approx/50 bg-status-approx-bg/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-status-approx" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Старт игры заблокирован до подтверждения подготовки
          </p>
          <p className="text-xs text-muted-foreground">
            Наличие файлов хроники или персонажа не начинает кампанию. Подтвердите источники,
            параметры, стартовую точку и отдельный лист персонажа в мастере настройки.
          </p>
        </div>
      </div>
      <Link
        to="/settings"
        className="touch-target inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Открыть мастер
      </Link>
    </div>
  );
}