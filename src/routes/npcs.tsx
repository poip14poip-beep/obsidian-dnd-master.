import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Users } from "lucide-react";

import { CertaintyBadge } from "@/components/StatusPill";
import { useObsidianStore } from "@/store/obsidian-store";

export const Route = createFileRoute("/npcs")({
  head: () => ({
    meta: [
      { title: "Известные NPC — Obsidian Control" },
      { name: "description", content: "Персонажи, которых Лия действительно встречала или о которых узнала, и только доступные ей сведения." },
    ],
  }),
  component: NpcsPage,
});

function NpcsPage() {
  const { npcs, locations } = useObsidianStore();
  const knownNpcs = npcs.filter((npc) => npc.playerVisible === true || (npc.playerKnowledge?.length ?? 0) > 0);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Users className="h-5 w-5"/>Известные NPC</h1>
        <p className="text-xs text-muted-foreground">Здесь отображаются только те персонажи, о существовании которых Лия действительно знает. Скрытые цели, мотивы и личные знания NPC недоступны игроку.</p>
      </header>
      {knownNpcs.length === 0 ? (
        <section className="panel-surface rounded-lg border border-dashed p-6 text-center">
          <BookOpen className="mx-auto mb-2 h-5 w-5 text-muted-foreground"/>
          <p className="text-sm font-medium">Пока нет известных NPC</p>
          <p className="mt-1 text-xs text-muted-foreground">Когда Лия встретит кого-то или узнает о нём из достоверного внутриигрового источника, мастер добавит запись.</p>
        </section>
      ) : knownNpcs.map((npc) => (
        <article key={npc.id} className="panel-surface space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div><h2 className="text-sm font-semibold text-foreground">{npc.name}</h2><p className="mt-1 text-xs text-muted-foreground">{npc.role}</p></div>
            <CertaintyBadge status={npc.certainty}/>
          </div>
          <p className="text-xs text-muted-foreground">Последнее известное место: {locations.find((location) => location.id === npc.locationId)?.name ?? "НЕ УСТАНОВЛЕНО"}</p>
          <div className="border-t border-border pt-3">
            <h3 className="mb-2 text-xs font-semibold text-foreground">Что известно Лии</h3>
            {(npc.playerKnowledge ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Известно только, что этот человек существует или был замечен. Имя и подробности пока неизвестны.</p>
            ) : (
              <ul className="space-y-2">
                {npc.playerKnowledge!.map((fact) => (
                  <li key={fact.id} className="rounded-md bg-background/60 p-2">
                    <p className="text-xs">{fact.factSummary}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{fact.certainty} · {fact.inGameDate} · Источник: {fact.acquisitionPath}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      ))}
    </main>
  );
}
