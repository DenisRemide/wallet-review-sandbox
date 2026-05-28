# 11. State machines

## Контекст

Система работает с явными жизненными циклами: Session, Intent, Deal, Transfer, Partner Onboarding, Auth Challenge. Каноническое описание переходов — в Notion (см. `.claude/context/ssot.md` → «Notion (canonical)»):

1. Session / Intent / Deal / Transfer State Machine Spec
2. Partner Onboarding State Machine

Код должен **буквально** соответствовать этим FSM. Любое расхождение — либо баг, либо спеку надо обновить.

## Проблема текущего кода

Статусы объявлены как enum'ы (`IntentState`, `SessionStatus`, `AuthUserProfileStatus`, и т.д.), но **валидация переходов не реализована**. Ничто не мешает handler'у записать `IntentState.COMPLITED` после `COLLECTING_COMPLIANCE`, минуя `SYSTEM_VERIFYING` и `DFI_VERIFYING`. Это — критическая точка спеки.

## Правило №1: FSM объявляется отдельно от бизнес-логики

Для каждой сущности со статусом — отдельный файл `modules/<name>/domain/<entity>.fsm.ts`, в котором:

1. Перечислены все состояния (используя существующий enum).
2. Задана таблица разрешённых переходов:
   ```ts
   export const intentTransitions: Record<IntentState, IntentState[]> = {
     [IntentState.COLLECTING_COMPLIANCE]: [IntentState.SYSTEM_VERIFYING],
     [IntentState.SYSTEM_VERIFYING]: [IntentState.DFI_VERIFYING, IntentState.RFI_PENDING],
     [IntentState.DFI_VERIFYING]: [IntentState.COMPLETED, IntentState.RFI_PENDING],
     [IntentState.RFI_PENDING]: [IntentState.SYSTEM_VERIFYING],
     [IntentState.COMPLETED]: [],
   };
   ```
3. Определены терминальные состояния (`COMPLETED`, `CANCELLED`, `FAILED`, `EXPIRED`).
4. Определены триггеры переходов (кто инициирует: user, system, DFI, scheduled timeout).

## Правило №2: валидация перехода — в domain-функции, не в handler'е

```ts
export const canTransitionTo = (from: IntentState, to: IntentState): boolean =>
  intentTransitions[from].includes(to);

export const assertTransition = (
  from: IntentState,
  to: IntentState,
): Result<void, 'INVALID_STATE_TRANSITION'> =>
  canTransitionTo(from, to) ? ok() : err('INVALID_STATE_TRANSITION');
```

Handler:
```ts
const transitionResult = assertTransition(intent.state, IntentState.SYSTEM_VERIFYING);
if (transitionResult.isErr()) return err(transitionResult.error);
```

## Правило №3: запись перехода — всегда в транзакции

- Чтение текущего состояния (`SELECT ... FOR UPDATE` или в рамках `runInTransactionResult`).
- Валидация перехода.
- Запись нового состояния + метки времени (`system_verified_at`, `dfi_verified_at`, `rfis_resolved_at`).
- Запись outbox-события о переходе.
- Коммит.

## Правило №4: каждое состояние имеет timestamp

В таблице — колонки `<state>_at` для каждого non-start состояния. Эталон — `Intent.systemVerifiedAt`, `dfiVerifiedAt`, `rfisResolvedAt` (`src/modules/intent/domain/intent.ts:22-24`). Это даёт audit trail без event sourcing.

## Правило №5: события на переходах

Любой переход FSM публикует событие через outbox:

- `intent.state.changed` с полями `{ intentId, from, to, at }`;
- или специфичные события `intent.system-verified`, `intent.completed`.

См. `06-outbox-and-events.md`.

## Правило №6: нет прямых `SET state = ...` в коде

Записать статус напрямую можно только через метод repository `updateState(id, nextState)`, который:

1. Загружает запись (с lock'ом).
2. Вызывает `assertTransition(current, next)`.
3. Пишет новый state + timestamp.
4. Возвращает `Result`.

Никаких `repo.update(id, { state: ... })` в handler'ах.

## Правило №7: spec — это источник истины

- Перед изменением FSM в коде — обнови Notion-спецификацию.
- Перед имплементацией нового состояния — проверь, что оно есть в Notion.
- При расхождении — побеждает Notion, код правится. (Или наоборот — явным решением с обновлением Notion.)
- AI-агенту: **всегда** загружать актуальную версию Notion-документа через `notion-fetch` перед работой с FSM. Не полагаться на память.

## Чек-лист FSM

- [ ] Для каждой сущности со статусом есть `<entity>.fsm.ts` с таблицей переходов
- [ ] Есть `canTransitionTo` и `assertTransition` — `Result`-based
- [ ] Repository имеет метод `updateState`, который валидирует переход
- [ ] Handler не пишет статус напрямую — только через `updateState`
- [ ] Каждый переход — в транзакции
- [ ] Каждый переход публикует outbox-событие
- [ ] Terminal states явно перечислены и не имеют исходящих переходов
- [ ] Timestamp'ы состояний есть в схеме БД
- [ ] Notion-спека и код синхронизированы

## Открытые вопросы для будущих версий спеки

Эти вопросы требуют решения владельца до имплементации — задавать при первом обращении к соответствующему модулю:

- **Session**: из каких состояний возможен `SUSPENDED` и кто инициирует `RESUMED`? Может ли Session вернуться из `EXPIRED`?
- **Intent**: какова TTL у `DFI_VERIFYING`? Кто инициирует `RFI_PENDING` — OFI или DFI? Есть ли лимит на количество RFI в рамках одного Intent?
- **Transfer**: full state machine ещё не существует — спецификация модуля создаётся с нуля, опирайся на Notion.
- **Compliance bundle**: как версионируется в течение жизни Intent? Есть ли immutable snapshot'ы после `SYSTEM_VERIFYING`?
- **Event schema versioning**: как выкатывается breaking change — dual-publish обе версии или rolling consumer upgrade?
