# Obsidian D&D Master

GitHub-only приложение для ведения кампаний D&D 5e (2024) в мире Экдрасиля.

## Разработка

Проект ведётся через GitHub. Рабочая ветка: `cloud-api-client`.

```sh
git clone https://github.com/poip14poip-beep/obsidian-dnd-master..git
cd obsidian-dnd-master.
bun install --frozen-lockfile
bun run dev
```

## Проверка

```sh
bun run test
bunx tsc --noEmit
bun run build
```

## Развёртывание

GitHub Actions собирает и публикует приложение на GitHub Pages при обновлении ветки `cloud-api-client`.

Игровые модели вызываются через защищённую Supabase Edge Function и RouterAI. Ключи API хранятся только в серверных Secrets и никогда не помещаются в клиентский код.

## Основные принципы

- ОБСИДИАН 4.1 — управляющая процедура кампании.
- D&D 2024 / SRD 5.2.1 — правила.
- Хроника Экдрасиля — источник канона мира.
- Лист персонажа и журнал кампании хранятся отдельно от канона.
- Каждый подтверждённый ход записывается в append-only журнал с проверкой целостности.
