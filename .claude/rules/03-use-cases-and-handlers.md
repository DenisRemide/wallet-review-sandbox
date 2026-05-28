# 03. Use-cases и handlers

## Контракт

Единственный интерфейс — `src/lib/clean/use-case.ts:1-3`:

```ts
export interface UseCaseHandler<UseCaseParams, UseCaseResult> {
  run(params: UseCaseParams): Promise<UseCaseResult>;
}
```

Все handler'ы реализуют его. Метод — всегда `run`. Не `execute`, не `handle`, не `call`.

## Связь с R14

**R03 описывает форму handler'а** — интерфейс, возвращаемый тип, структуру файла, декомпозицию на sub-handler'ы. **Что handler делает внутри `run()`** — content-ответственность — описана в отдельной спеке **R14** (`14-use-case-boundaries.md`). Ключевые правила R14, которые применяются вместе с R03 на ревью любого handler'а:

- ≤ 5 бизнес-зависимостей в конструкторе
- нет `Buffer` / `Record<string, unknown>` / `_enc`-полей в Params/Result
- нет ручной оркестрации envelope-encryption
- нет доменных парсеров в `*.utilities.ts` рядом
- scatter над >3 таблицами выносится в domain-сервис

Если ревью находит формально «форма правильная, но содержание имплементационное» — смотри R14.

## Правила handler'а

1. **Один handler — одна операция.** `CreateUserHandler`, `SignInHandler`, `EnvelopeEncryptHandler`. Не `UserHandler` с десятью методами.
2. **Один файл.** `*.handler.ts` + `*.module.ts` + `*.errors.ts`. Типы `Params` / `Result` объявляются в `.handler.ts`, если они специфичны для этого use-case. Эталон — `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:18-27`.
3. **Handler — это `@Injectable()`-класс.** Зависимости инжектятся через конструктор. Никаких `new Service()` внутри `run`.
4. **Handler возвращает `Result<T, E>`.** См. `02-result-and-errors.md`.
5. **Handler — единственное место, где живёт бизнес-логика use-case'а.** Не раскидывать логику по utility-функциям и не делать «helper-сервисы», которые делают половину работы handler'а.
6. **Sub-handlers разрешены.** Если use-case декомпозируется на шаги, каждый шаг — отдельный handler, и родитель вызывает их. Эталон — `SignInHandler` вызывает `SignInEmailHandler` / `SignInTotpHandler` / `ResolvePendingChallengeHandler` (`sign-in.handler.ts:110-139`).

## Наименование

- Файл: `<action>-<subject>.handler.ts` (`create-user.handler.ts`, `sign-in.handler.ts`, `envelope-encrypt.handler.ts`).
- Класс: `PascalCase` + суффикс `Handler`.
- Типы: `<Name>Params`, `<Name>Result`, `<Name>ErrorCode`.
- Каталог: имя совпадает с именем файла без `.handler.ts`.

## Структура `run()`

1. **Валидация и rate-limiting** (если нужны). Пример — `SignInHandler` берёт токен из `RateLimitService` первым делом (`sign-in.handler.ts:49-58`).
2. **Вход в блокировку** (если операция не идемпотентна). `RedlockService.using([...], duration, routine)`. См. `05-transactions-and-locks.md`.
3. **Получение данных** через repositories / external-services, с ранним возвратом ошибок.
4. **Бизнес-решение** — чистая логика, никаких side-effects.
5. **Запись / публикация событий** внутри транзакции.
6. **Возврат `ok(value)` или `err(code)`**.

## Правило: presentation не ходит в handler напрямую через контроллер

Контроллер зовёт **presentation-service**, presentation-service зовёт handler. Это создаёт одну точку маппинга `Result → HttpException`. См. `08-api-and-dto.md`.

## Module для handler'а

Каждый handler живёт в своём `*.module.ts`. Эталон — `src/modules/user/use-case/create-user/create-user.module.ts`. Правила:

- Импортирует все зависимости (repositories, другие handler-модули, infrastructure-модули).
- Экспортирует **только сам handler** (не репозитории, не внутренние зависимости).
- Агрегирующие модули (`UserExternalModule`, `AuthPresentationModule`) импортируют handler-модули и собирают их в публичный сервис.

## Чек-лист handler'а

- [ ] Реализует `UseCaseHandler<Params, Result<T, E>>`
- [ ] Класс помечен `@Injectable()`
- [ ] Единственный публичный метод — `run(params)`
- [ ] Зависимости только через конструктор
- [ ] Возвращает `Result<T, E>` с именованным error-типом
- [ ] Нет `try/catch` (кроме low-level утилит)
- [ ] Нет прямых обращений к БД / Redis / RabbitMQ — только через repositories и сервисы
- [ ] Если use-case не идемпотентен — обёрнут в `RedlockService.using`
- [ ] Если нужна транзакция — обёрнут в `runInTransactionResult`
- [ ] Есть `*.module.ts` и `*.errors.ts` рядом
- [ ] Файл не длиннее ~200 строк. Если больше — декомпозировать на sub-handlers
