# 06. Outbox и события

## Зачем outbox

Решает **dual-write problem**: если сначала `COMMIT` транзакции, потом `rabbitProxy.emit()`, то падение между ними потеряет событие. Outbox решает это тем, что событие сохраняется **в той же транзакции**, что и бизнес-данные, а отправляется асинхронно шедулером.

Реализация — `src/infrastructure/rabbitmq/outbox/`.

## Правило №1: бизнес-логика не вызывает `rabbitProxy.emit()` напрямую

Только `OutboxService.createMessage(...)` — и только внутри транзакции, в которой записаны бизнес-данные.

Эталон — `src/infrastructure/rabbitmq/outbox/outbox.service.ts:16-34`:

```ts
await this.outboxService.createMessage({
  type: 'partner.onboarded',
  routingKey: 'partner.onboarded',
  exchange: 'partner.events',
  data: { partnerId, ... },
});
```

## Правило №2: публикация — только через шедулер

`OutboxSynchronizationScheduler` — `src/infrastructure/rabbitmq/outbox/outbox-synchronization/outbox-synchronization.scheduler.ts:21-92`:

- Cron `EVERY_30_SECONDS`.
- Обёрнут в `RedlockService.using(['lock:outbox'], 10000, ...)` — только один инстанс обрабатывает очередь.
- Читает batch из 50 messages, публикует параллельно, успешные удаляет, неудачные `incrementRetryCount`.
- **Текущая реализация retry'ит бесконечно.** Это осознанная простота стартового этапа; при росте нагрузки добавляется DLQ — см. открытые вопросы в `11-state-machines.md` / product-спеке.

## Правило №3: событие — `createMessage`, прямой `emitMessage` только в особых случаях

`OutboxService.emitMessage()` (`outbox.service.ts:36-59`) существует для кейсов, где нужна попытка немедленной доставки после коммита (например, критические события, где задержка в 30 секунд неприемлема). Для всего остального — полагаться на шедулер.

## Правило №4: event contract

Для каждого типа событий должен быть **типизированный контракт**. Это больное место текущей кодовой базы — `createMessage<T>` принимает `Record<string, any>`. Исправление — часть спеки:

- Определить тип события в `modules/<name>/domain/events/<event-name>.event.ts`:
  ```ts
  export type PartnerOnboardedEvent = {
    type: 'partner.onboarded';
    version: 1;
    data: { partnerId: string; at: string };
  };
  ```
- Handler, публикующий событие, импортирует этот тип и передаёт его в `createMessage<PartnerOnboardedEvent['data']>(...)`.
- `type` и `routingKey` — строковые константы из `modules/<name>/domain/events/routing-keys.ts`. Не литералы в handler'е.
- Поле `version` в payload — обязательно. Изменения схемы делаются через новый `version`, старая версия продолжает публиковаться пока есть consumer'ы.

## Правило №5: идемпотентность consumer'а

Outbox даёт **at-least-once**, не exactly-once. Любой consumer (в этом проекте или в соседнем) обязан:

- уметь обрабатывать дубликаты (через `message.id` или бизнес-ключ);
- быть идемпотентным по эффекту.

Это документируется в контракте события.

## Чек-лист публикации события

- [ ] Событие сохраняется через `OutboxService.createMessage` внутри той же транзакции, что и бизнес-данные
- [ ] `type` и `routingKey` — константы из `modules/<name>/domain/events/`
- [ ] Payload типизирован (не `Record<string, any>`)
- [ ] Payload содержит `version: number`
- [ ] Handler не вызывает `rabbitProxy.emit()` напрямую
- [ ] Contract события задокументирован в `domain/events/*.event.ts`
- [ ] Consumer'ы идемпотентны (проверка на уровне ревью кросс-сервисных интеграций)

## Чек-лист регистрации нового роутинг-ключа

- [ ] Добавлен в `modules/<name>/domain/events/routing-keys.ts`
- [ ] Документирован exchange (fanout/topic/direct) и ожидаемые consumer'ы
- [ ] Версия схемы начата с `1`
- [ ] При bumping'е версии — старая версия продолжает публиковаться параллельно, пока consumer'ы не обновятся
