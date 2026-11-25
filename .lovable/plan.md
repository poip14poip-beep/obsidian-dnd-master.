# План: облачное хранение через приватную схему `obsidian` (обновлено по итогам read-only интроспекции)

Статус: серверная инфраструктура (локдаун прав `obsidian`, приватный bucket, 4 `public` RPC-обёртки и Edge Function `obsidian-api` v1) развёрнута в Supabase `dbchfgkdrqpjspptoezh`, но **фронтенд остаётся на `localStorage` store и ещё не подключён к cloud API**; end-to-end проверка реальным пользователем не проводилась (`auth.users` = `0`); проект не публикуется.

## Выполненные инфраструктурные изменения 2026-11-25
- **Миграция `lock_down_obsidian_direct_client_access` применена:**
  - Отозван `USAGE` на схему `obsidian` у `anon` и `authenticated`.
  - Отозваны все table privileges в схеме `obsidian` у `anon` и `authenticated`.
  - Отозван `EXECUTE` всех функций схемы `obsidian` у `PUBLIC`, `anon`, `authenticated`.
  - Закрыты default privileges для будущих таблиц и функций роли `postgres` в схеме `obsidian`.
  - Отдельно выдан `GRANT EXECUTE ON FUNCTION obsidian.commit_turn(uuid) TO service_role`.
- **Подтверждённые проверки прав после миграции:**
  - `anon` / `authenticated` schema `USAGE` = `false`;
  - `anon` / `authenticated` `EXECUTE` на `obsidian.commit_turn` = `false`;
  - `service_role` schema `USAGE` = `true` и `EXECUTE` на `obsidian.commit_turn` = `true`;
  - ни одна таблица в `obsidian` не имеет grants для `anon` / `authenticated`.
- **Приватный Storage bucket:** создан `obsidian-source-documents` (`public = false`), лимит `52,428,800` bytes, разрешённые форматы: PDF, DOCX, DOC, TXT, Markdown.
- **`public` RPC-обёртки (`SECURITY DEFINER`, `SET search_path = ''`, `EXECUTE` только `service_role`):**
  - `public.obsidian_api_create_campaign`
  - `public.obsidian_api_get_campaign_snapshot`
  - `public.obsidian_api_save_draft`
  - `public.obsidian_api_commit_turn` (устанавливает транзакционные JWT claims проверенного `actor` и вызывает `obsidian.commit_turn`)
  - Пройдены SQL smoke checks по ошибочным параметрам для `bootstrap` (`get_campaign_snapshot`) и `save_draft`.
- **Edge Function `obsidian-api`:** развёрнута (`ACTIVE v1`), `verify_jwt = true`, проверяет токен через `auth.getUser(user JWT)`, не принимает `actor`/`owner_id` от клиента, поддерживает actions `create_campaign`, `bootstrap`, `save_draft`, `commit_turn`; CORS allowlist ограничен preview URL + `localhost`.
- **Конфигурация PostgREST:** `current_setting('pgrst.db_schemas', true)` вернул `NULL`, поэтому конфигурация exposed schemas PostgREST на уровне БД не подтверждена (приватность остаётся архитектурным требованием, а прямой доступ `anon`/`authenticated` дополнительно закрыт отзывом grants).
- **Security Advisor после изменений:** единственным finding остаётся прежнее предупреждение `public.rls_auto_enable()` (`SECURITY DEFINER`, executable by `anon`/`authenticated`); не менять без отдельного анализа.
- **Ограничения текущего состояния (важно):**
  - Edge Function `obsidian-api` не проверена end-to-end реальным пользователем (`auth.users` count = `0`).
  - Фронтенд продолжает работать с локальным `localStorage` store и не вызывает cloud API.
  - Источники/вложения (`obsidian-source-documents`) и остальные CRUD-операции (помимо 4 базовых actions) ещё не интегрированы.

## 1. Факты read-only интроспекции (Supabase `dbchfgkdrqpjspptoezh`)
- **Схема `obsidian` (13 таблиц):** `campaigns`, `sources`, `canon_facts`, `world_state`, `player_character_state`, `npcs`, `npc_knowledge`, `factions`, `locations`, `timeline_events`, `turn_drafts`, `session_log`, `audit_log`.
- **RLS и триггеры:** на всех 13 таблицах включены RLS owner policies по `owner_id = auth.uid()`. На `session_log` и `audit_log` действуют append-only триггеры.
- **Текущие объёмы данных:** точный `row count` во всех 13 таблицах равен `0`.
- **Экспозиция PostgREST:** приватность/non-exposed схемы `obsidian` — архитектурное требование проекта и принятое текущее допущение (прямой доступ браузера запрещён); `current_setting('pgrst.db_schemas', true)` вернул `NULL`, поэтому конфигурация exposed schemas PostgREST не подтверждена.
- **История коррекции по grants (закрыто миграцией `lock_down_obsidian_direct_client_access` 2026-11-25):**
  - Исходный schema ACL при первичной интроспекции: `{postgres=UC/postgres,service_role=U/postgres,authenticated=U/postgres}`; у `authenticated` были `SELECT/INSERT/UPDATE/DELETE` на большинство таблиц, `SELECT/INSERT` на `session_log`/`audit_log` и `EXECUTE` на `obsidian.commit_turn(uuid)`.
  - 2026-11-25 применена миграция `lock_down_obsidian_direct_client_access`: права `anon`/`authenticated` на схему, таблицы, функции и default privileges полностью отозваны; `service_role` сохраняет `USAGE` и `EXECUTE` на `obsidian.commit_turn(uuid)`.
- **Функции в схеме `obsidian`:**
  - `obsidian.commit_turn(uuid)`: `SECURITY DEFINER`, `SET search_path = ''`, проверяет `auth.uid()` в начале; `EXECUTE` у `anon`/`authenticated` отозван (2026-11-25), выдан `service_role`.
  - `obsidian.apply_turn_state_delta(uuid, uuid, jsonb)`: `SECURITY DEFINER`, `SET search_path = ''`, напрямую у `authenticated` прав `EXECUTE` нет, вызывается внутри `commit_turn`.
- **Edge Functions:** на момент первичной интроспекции было `0`; 2026-11-25 развёрнута `obsidian-api` (`ACTIVE v1`).

## 2. Что проверено в текущем коде приложения
- `src/domain/types.ts`: 11 локальных коллекций в `ObsidianCollections` (`sources`, `canon_facts`, `world_state`, `player_character_state`, `npcs`, `factions`, `locations`, `timeline_events`, `turn_drafts`, `session_log`, `audit_log`).
- `src/domain/storage.ts`: `loadAllCollections`, `persistAndVerifyCollections` (запись -> read-back -> сравнение канонического payload и checksum).
- `src/store/obsidian-store.tsx`: единый локальный store, локальный commit хода.
- `src/lib/supabase-auth.ts`: только `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`, `service_role`/`sb_secret_` запрещены во фронтенде; `.from(` в `src/` не используется.

## 3. Маппинг: 11 коллекций UI vs 13 таблиц `obsidian` (не 1:1)

| Сущность в UI (`ObsidianCollections`) | Таблицы в `obsidian` | Расхождение и требуемая адаптация |
|---|---|---|
| *(отсутствует отдельная коллекция)* | `campaigns` | В UI метаданные кампании (`campaignName`, статус подготовки и т.д.) хранятся внутри `world_state`. Нужен явный `campaign_id` и отдельный адаптер строки `campaigns`. |
| `world_state` (единый агрегат) | `world_state` (key/value rows) + `campaigns` | Агрегат UI (`campaignName`, дата, локация, `setup`, маршруты, последствия) нужно детерминированно раскладывать в поля `campaigns` и именованные key/value-строки `obsidian.world_state` и собирать обратно без потери канонического вида. |
| `player_character_state` (агрегат) | `player_character_state` (`character_data`) | Изолированный лист персонажа сериализуется в `character_data` без вложения в `world_state` (инвариант `detectNestedPlayerState` сохраняется на клиенте и сервере). |
| `npcs` (включая `knowledge[]`) | `npcs` + `npc_knowledge` | В БД знания NPC вынесены в дочернюю таблицу `npc_knowledge`. При чтении выполняется сборка `NpcRecord.knowledge`, при записи — согласованное обновление обеих таблиц в одной RPC-транзакции. |
| `sources` (включая `SourceDocument.content`) | `sources` (только metadata) | В БД `obsidian.sources` нет колонки `content` — хранятся только метаданные (`content_status`, `sha256`, `source_uri`). Текст/файлы источника нельзя записывать в `sources`: хранить только локально или через отдельный защищённый storage bucket с ссылкой в `source_uri` и проверкой `sha256`. |
| `session_log` (`GAME_TURN` + `TECHNICAL_NOTE`) | `session_log` (игровые записи, append-only) | БД `obsidian.session_log` требует игровые записи. Нельзя смешивать `TECHNICAL_NOTE` с игровыми ходами в `session_log`: технические заметки нужно вынести в отдельную стратегию (например, оставлять в локальном журнале, писать в `audit_log` с отдельным типом или выделить отдельную таблицу по согласованию), не нарушая нумерацию ходов и append-only триггер. |
| `audit_log` | `audit_log` (append-only) | Структуры полей UI `AuditEntry` и колонок БД `obsidian.audit_log` требуют явного маппера и проверки append-only без `UPDATE`/`DELETE`. |
| `canon_facts`, `factions`, `locations`, `timeline_events`, `turn_drafts` | Одноимённые таблицы | Проверить поколоночное соответствие (в т.ч. `campaign_id`, ревизии/provenance, `updated_at`/версию, формат `state_delta` для `turn_drafts` -> `commit_turn`). |

## 4. Целевая архитектура API

```text
Браузер (publishable key + пользовательский JWT)
   │  POST /functions/v1/obsidian-api  (Authorization: Bearer <user JWT>)
   ▼
Edge Function obsidian-api в проекте dbchfgkdrqpjspptoezh (verify_jwt = true)
   1. auth.getUser(userJWT) через anon/publishable client -> verified actor (user.id)
   2. строгая валидация payload (zod); отклонение любых owner_id/user_id из тела
   3. серверный service_role client (SUPABASE_SERVICE_ROLE_KEY только в env Edge Function)
   4. вызов узких public.obsidian_api_* RPC с p_actor = user.id
   ▼
public.obsidian_api_* (SECURITY DEFINER, SET search_path = '', EXECUTE только service_role)
   - в начале транзакции:
       perform set_config('request.jwt.claim.sub', p_actor::text, true);
       perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
   - явная проверка/фильтрация owner_id = p_actor на всех чтениях и записях
   - атомарный вызов obsidian.commit_turn(p_draft_id) в той же транзакции
   - чтение/запись в приватную схему obsidian.* (при отключённом доступе браузера)
```

### Почему Edge Function в самом Supabase-проекте
- `SUPABASE_SERVICE_ROLE_KEY` остаётся внутри окружения Supabase-проекта `dbchfgkdrqpjspptoezh` и никогда не попадает в клиентский бандл, `.env` или репозиторий.
- `verify_jwt = true` отсекает неавторизованные запросы на шлюзе, а повторная проверка `auth.getUser(userJWT)` гарантирует валидность и актуальность сессии (отзыв/бан/истечение).
- `obsidian.commit_turn(uuid)` и `obsidian.apply_turn_state_delta(uuid, uuid, jsonb)` не требуют переписывания, так как `auth.uid()` внутри `commit_turn` получает проверенный `p_actor` из транзакционно-локальных настроек `set_config(..., true)`.

## 5. Перечень RPC-обёрток и действий Edge Function (`obsidian-api`)

| `action` в Edge Function | `public` RPC-обёртка (`EXECUTE` только `service_role`) | Статус | Назначение |
|---|---|---|---|
| `bootstrap` | `public.obsidian_api_get_campaign_snapshot` | Развёрнуто (v1, SQL smoke check по ошибкам OK, без E2E) | Загрузка кампании (`campaigns`) и связанных таблиц владельца |
| `create_campaign` | `public.obsidian_api_create_campaign` | Развёрнуто (v1, без E2E) | Явное создание пустой/незапущенной кампании (`campaigns`), без фиктивного старта |
| `save_draft` | `public.obsidian_api_save_draft` | Развёрнуто (v1, SQL smoke check по ошибкам OK, без E2E) | Сохранение черновика хода в `obsidian.turn_drafts` без commit |
| `commit_turn` | `public.obsidian_api_commit_turn` | Развёрнуто (v1, без E2E) | Установка локальных JWT claims (`sub` = `p_actor`) -> вызов `obsidian.commit_turn(p_draft_id)` |
| `upsert_entity` (и прочие CRUD) | *(ещё не создано)* | Запланировано | Сохранение сущностей по белому списку (`npcs`+`npc_knowledge`, `world_state`, `player_character_state`, `canon_facts`, `factions`, `locations`, `timeline_events`, `sources` metadata) |
| `verify_readback` | *(ещё не создано)* | Запланировано | Серверный read-back всех таблиц кампании владельца и возврат канонических checksums для сверки |
| Вложения источников (`obsidian-source-documents`) | *(ещё не создано)* | Bucket создан, API не интегрирован | Загрузка/чтение файлов PDF/DOCX/DOC/TXT/Markdown через подписанные URL/проверенный прокси с проверкой `sha256` |

Запрещено в API: `UPDATE`/`DELETE` в `session_log` и `audit_log` (дополнительно защищено БД-триггерами), принятие `owner_id` из тела запроса, вложение `player_character_state` в `world_state`, прямой вызов `obsidian.apply_turn_state_delta` извне `commit_turn`.

## 6. Состояние grants и безопасности БД (обновлено 2026-11-25)
- **Выполнено (`lock_down_obsidian_direct_client_access`):**
  - Отозваны `USAGE` на `obsidian`, все table privileges в `obsidian` и `EXECUTE` всех функций схемы у `PUBLIC`, `anon`, `authenticated`; закрыты default privileges роли `postgres` для будущих объектов в `obsidian`.
  - Выдан `GRANT EXECUTE ON FUNCTION obsidian.commit_turn(uuid) TO service_role`.
  - Подтверждено: `anon`/`authenticated` имеют `USAGE = false`, `commit_turn EXECUTE = false`, 0 табличных grants; `service_role` имеет `USAGE = true` и `commit_turn EXECUTE = true`.
- **Открытые вопросы безопасности:**
  - `current_setting('pgrst.db_schemas', true)` вернул `NULL` — список exposed schemas PostgREST стоит отдельно подтвердить в настройках проекта Supabase.
  - Прежнее предупреждение Security Advisor `public.rls_auto_enable()` (`SECURITY DEFINER`, executable by `anon`/`authenticated`) остаётся единственным finding; не трогать без отдельного анализа.

## 7. Точные риски и неразрешённые места
1. **Неподтверждённый `pgrst.db_schemas` и оставшийся Security Advisor finding:** `current_setting('pgrst.db_schemas', true)` вернул `NULL`, а `public.rls_auto_enable()` остаётся единственным finding в Security Advisor (требует отдельного анализа, не менять вслепую). Прямой клиентский доступ к `obsidian` уже закрыт отзывом grants.
2. **Контекст `auth.uid()` vs `service_role`:** `obsidian.commit_turn` — `SECURITY DEFINER`, но проверяет `auth.uid()` в начале; если внутри также используется `auth.role()` или другие поля `auth.jwt()`, набор полей в `request.jwt.claims` должен быть проверен по полному телу функции до написания обёртки.
3. **Риск эскалации через `service_role`:** так как обёртки принимают `p_actor` от `service_role`, любая утечка `SUPABASE_SERVICE_ROLE_KEY` или ошибка выдачи `EXECUTE` ролям `anon`/`authenticated` позволит действовать от чужого имени. Обязателен тест `has_function_privilege` для `anon`/`authenticated` = `false`.
4. **Расхождение модели `world_state` + `campaigns`:** в UI нет сущности `campaign_id` и экрана выбора кампании; сохранение UI-агрегата `world_state` в key/value-таблицу требует строго детерминированного словаря ключей и сериализации, иначе read-back checksum разойдётся.
5. **`SourceDocument.content` отсутствует в БД:** попытка синхронизировать прикреплённый текст источников в `obsidian.sources` приведёт к потере контента. Нужно явно разделить metadata (БД: `content_status`, `sha256`, `source_uri`) и тело документа (локально или приватный Supabase Storage с проверкой `sha256`).
6. **`TECHNICAL_NOTE` в `session_log`:** БД `obsidian.session_log` принимает только игровые записи и защищена append-only триггером. Нужно до реализации утвердить, где хранятся технические сообщения UI (локально / `audit_log` / отдельная таблица).
7. **Формат `state_delta` в `turn_drafts` -> `apply_turn_state_delta`:** контракт `jsonb`-дельты, которую ожидает `apply_turn_state_delta(uuid, uuid, jsonb)`, ещё нужно сопоставить с полями UI `TurnDraft`, иначе `commit_turn` отклонит черновик или изменит не те ключи.
8. **Конфликты версий и частичная атомарность:** атомарность БД гарантирована внутри `commit_turn` и одного RPC, но последовательность отдельных `upsert_entity` не является одной транзакцией; требуется оптимистичная проверка версий и честный UI-статус при ошибке read-back.
9. **Миграция существующих локальных данных:** так как все 13 таблиц сейчас пусты (`0` строк), перенос данных из `localStorage` в облако должен выполняться только по явному действию пользователя после выбора/создания `campaign_id`, с предпросмотром расхождений (`SourceDocument.content`, `TECHNICAL_NOTE`) и последующим `verify_readback`.
10. **Отсутствие E2E-проверки под реальным пользователем:** `auth.users` count = `0`, поэтому полная цепочка JWT -> Edge Function `obsidian-api` -> `public.obsidian_api_*` -> `obsidian.commit_turn` ещё не пройдена end-to-end.

## 8. Этапы сериализации, миграции и внедрения
1. **Этап 1 — Базовая серверная инфраструктура (ВЫПОЛНЕНО 2026-11-25, без E2E):**
   - `[x]` Применена миграция `lock_down_obsidian_direct_client_access` и проверены grants `anon`/`authenticated`/`service_role`.
   - `[x]` Создан приватный bucket `obsidian-source-documents` (`public = false`, лимит 52,428,800 bytes, PDF/DOCX/DOC/TXT/Markdown).
   - `[x]` Созданы 4 `public` RPC-обёртки (`obsidian_api_create_campaign`, `obsidian_api_get_campaign_snapshot`, `obsidian_api_save_draft`, `obsidian_api_commit_turn`), пройдены SQL smoke checks по ошибочным параметрам для `bootstrap` и `save_draft`.
   - `[x]` Развёрнута Edge Function `obsidian-api` (`ACTIVE v1`, `verify_jwt = true`, `auth.getUser`, CORS allowlist preview URL + `localhost`).
2. **Этап 2 — End-to-end проверка v1 и спецификация оставшихся контрактов (СЛЕДУЮЩИЙ ШАГ):**
   - `[ ]` Выполнить E2E-проверку `create_campaign`, `bootstrap`, `save_draft`, `commit_turn` с реальным пользователем в `auth.users` (после создания тестового аккаунта и с очисткой тестовых строк).
   - `[ ]` Зафиксировать точные контракты сериализации `UI <-> DB` (`campaigns + world_state`, `npcs + npc_knowledge`, `player_character_state.character_data`, `sources` metadata + вложения в `obsidian-source-documents`, `TECHNICAL_NOTE` вне `obsidian.session_log`, `audit_log`, `state_delta`).
   - `[ ]` Отдельно разобрать единственный finding Security Advisor (`public.rls_auto_enable()`) и подтвердить конфигурацию exposed schemas PostgREST в настройках Supabase.
3. **Этап 3 — Расширение RPC и Edge Function для полного CRUD и вложений (ЗАПЛАНИРОВАНО):**
   - `[ ]` Добавить оставшиеся `public.obsidian_api_*` обёртки и actions в `obsidian-api` (CRUD всех сущностей, `verify_readback`, безопасная работа с вложениями в `obsidian-source-documents` и проверкой `sha256`).
4. **Этап 4 — Клиентский слой, сериализация и явная миграция локального состояния (ЗАПЛАНИРОВАНО):**
   - `[ ]` Реализовать чистые адаптеры `src/domain/cloud-mapper.ts` с unit-тестами и клиент `src/lib/obsidian-api.ts` (вызов `supabase.functions.invoke('obsidian-api', ...)`).
   - `[ ]` Добавить явное подключение кампании (`campaign_id`), сохраняя `localStorage` store как локальный режим до успешного `bootstrap` и `verify_readback`.
   - `[ ]` Реализовать мастер явного импорта локального снимка в облачную кампанию с предпросмотром расхождений и сверкой read-back.

## 9. Минимальный набор тестов
- **Сериализация (unit):** обратимость `UI <-> DB` для `campaigns + world_state`, `npcs + npc_knowledge`, `player_character_state.character_data`, отбрасывание `SourceDocument.content` с сохранением `sha256`/`content_status`, отделение `TECHNICAL_NOTE` от `session_log`, запрет вложения `player_character_state` в `world_state`.
- **Права SQL:** `anon` и `authenticated` не имеют `EXECUTE` на `public.obsidian_api_*` (и, после утверждённого отзыва grants, не имеют `USAGE`/табличных прав на `obsidian` и `EXECUTE` на `obsidian.commit_turn`).
- **Транзакционная изоляция `set_config`:** после завершения RPC `current_setting('request.jwt.claim.sub', true)` и `request.jwt.claims` в следующей транзакции пусты.
- **Edge Function auth/validation:** без JWT -> `401`; невалидный/отозванный JWT -> `401`; `owner_id`/`user_id` в теле -> `400`; неизвестный `action`/сущность -> `400`.
- **Изоляция владельцев и append-only:** пользователь A не может читать/менять/коммитить черновик пользователя B; `UPDATE`/`DELETE` в `session_log` и `audit_log` отклоняются.
- **Атомарность `commit_turn`:** повторный commit того же `draft_id` не создаёт дубль; `turnNumber` последовательны; ошибка в `apply_turn_state_delta` откатывает всю транзакцию.
- **Фронтенд и безопасность бандла:** ошибка при расхождении `verify_readback` (успех не заявляется); отсутствие `service_role`/`sb_secret_` и прямых `.from(` к `obsidian` в `src/`.