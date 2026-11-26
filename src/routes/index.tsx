import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Экдрасиль — живой мир D&D" },
      { name: "description", content: "Живой мир Экдрасиль. Кампания D&D 2024 по системе ОБСИДИАН 4.1." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-xl flex-col items-center justify-center gap-5 px-5 py-10 text-center">
      <p className="mono-code text-xs uppercase tracking-[0.24em] text-primary">
        ОБСИДИАН 4.1 · D&D 2024
      </p>
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-[0.16em] text-foreground sm:text-5xl">
          ЭКДРАСИЛЬ
        </h1>
        <p className="text-sm text-muted-foreground">
          Мир, который продолжает жить независимо от решений игрока.
        </p>
      </div>
      <Link
        to="/play"
        className="panel-surface touch-target mt-4 inline-flex min-h-14 w-full items-center justify-center rounded-xl border-primary/50 bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
      >
        Играть в мир Экдрасиль
      </Link>
    </main>
  );
}
