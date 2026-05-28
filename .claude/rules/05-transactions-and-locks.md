# 05. Транзакции и блокировки

## Транзакции

### Инструмент: `runInTransactionResult`

Единственный способ начать транзакцию — обёртка `src/lib/typeorm/run-in-tx-result.ts:8-34`:

```ts
const result = await runInTransactionResult(async () => {
  const a = await this.repoA.insert(...);
  if (a.isErr()) return err(a.error);
  const b = await this.repoB.insert(...);
  if (b.isErr()) return err(b.error);
  return ok({ a: a.value, b: b.value });
});
```

- Возвращает `Result<T, E | 'UNKNOWN_DATABASE_TRANSACTION_ERROR'>`.
- Автоматически rollback'ит при `err` или исключении.
- Использует `typeorm-transactional` и DataSource, инициализированные в `src/main.ts` через `initializeTransactionalContext()`.

### Правила

1. **Транзакция начинается в handler'е, не в repository.** Repository не знает, в транзакции он или нет.
2. **Транзакция — на use-case, а не на HTTP-запрос.** Один handler = одна транзакция (или несколько мелких, осознанно).
3. **Не вложенные транзакции без явной необходимости.** Если нужны — указывай `propagation: 'REQUIRES_NEW'` или `'NESTED'` через `WrapInTransactionOptions`.
4. **Outbox-message создаётся в той же транзакции, что и бизнес-данные.** См. `06-outbox-and-events.md`.

### Чек-лист транзакции

- [ ] Используется `runInTransactionResult`, не голый `QueryRunner`
- [ ] Начата в handler'е, не в repository / не в controller
- [ ] Внутри нет внешних сайд-эффектов (HTTP-вызовы, email, прямые emit в Rabbit) — только БД
- [ ] Все события складываются в outbox, не публикуются напрямую
- [ ] Код возвращает `Result` — rollback произойдёт автоматически

## Распределённые блокировки (Redlock)

### Когда использовать

Когда операция **не идемпотентна** и два параллельных вызова могут привести к рассинхрону:

- вход/регистрация (`SignInHandler` — `sign-in.handler.ts:60-144`);
- фоновые шедулеры, чтобы только один инстанс выполнял задачу (`OutboxSynchronizationScheduler` — `outbox-synchronization.scheduler.ts:22-88`);
- создание ресурса по уникальному external-ключу.

### Инструмент: `RedlockService.using`

Эталон — `src/infrastructure/redis/redlock/redlock.service.ts:23-65`:

```ts
const result = await this.redlockService.using(
  [`atomic:sign-in:${email}`],      // ключи
  5000,                              // duration ms
  async (): Promise<Result<T, E>> => {
    // критическая секция
    return ok(value);
  },
);
```

- Routine **обязана** вернуть `Result<T, E>`. Никаких throw внутри.
- Ошибки Redlock мапятся в именованные коды (`LOCK_NOT_ACQUIRED`, `LOCK_PARTIAL_APPLY`, и т.д.) через type guards в `redlock.errors.ts`.
- Результат выглядит как `Result<T, E | RedisRedlockUsingError>`. Handler **должен** обработать обе ветки (`isRedisRedlockUsingError`).

### Правила ключей

- Формат: `<scope>:<operation>:<id>`. Примеры: `atomic:sign-in:<email>`, `lock:outbox`, `lock:partner-onboarding:<partnerId>`.
- Ключ должен быть стабильным — без timestamp'ов и случайных суффиксов.
- `duration` выбирается по верхней оценке времени критической секции × 2. Минимум 1000 ms.

### Важно

- Production-deployment Redis должен быть **sentinel/cluster** или хотя бы replicated — одиночный Redis ломает гарантии Redlock. См. `README.md` проекта / deploy-конфиг. Это architectural requirement, не code-style.

## Advisory locks (PostgreSQL)

Когда нужна блокировка **внутри одной транзакции** и завязанная на БД-сессию (не кросс-инстансная):

- `src/infrastructure/db/advisory-lock/advisory-lock.service.ts:10-33` — `tryAdvisoryXactLock(key)`.
- Использует `pg_try_advisory_xact_lock`, ключ — `sha256(key)` в виде `BigInt64`.
- Возвращает `Result<boolean, ...>` — `true` если лок взят.
- Лок **автоматически отпускается** в конце транзакции.

### Когда advisory вместо Redlock

- Операция целиком внутри одной БД-транзакции.
- Нужна serialization двух параллельных транзакций без явного `SELECT ... FOR UPDATE`.
- Пример: атомарный upsert с последующими insert'ами в дочерние таблицы.

### Чек-лист блокировок

- [ ] Для кросс-инстансных non-идемпотентных операций — `RedlockService.using`
- [ ] Для транзакционной сериализации — `AdvisoryLockService.tryAdvisoryXactLock`
- [ ] Ключи стабильные и namespaced
- [ ] Routine Redlock'а возвращает `Result`, ошибки Redlock обрабатываются отдельно от бизнес-ошибок
- [ ] Duration подобран осознанно, не `Number.MAX_SAFE_INTEGER`
