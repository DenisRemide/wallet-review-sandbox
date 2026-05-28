# Спецификация качества кода match-backend

Эта директория — **обязательное руководство** для любого, кто пишет код в `match-backend` (человек или AI-агент). Её задача — зафиксировать архитектурные решения, которые уже приняты в кодовой базе, и не дать им размыться по мере роста проекта.

## Принципы

1. **Консистентность важнее локальной «лучшести».** Если в модуле что-то сделано определённым образом, новый код делается так же. Не переписывай чужой паттерн потому что тебе нравится другой.
2. **Ошибки — это значения.** Никаких `throw` в бизнес-логике. Только `Result<T, E>` из `neverthrow`. См. `02-result-and-errors.md`.
3. **Каждый use-case — отдельный handler.** Один файл, одна операция, один `run()`. См. `03-use-cases-and-handlers.md`.
4. **Границы bounded context охраняются.** Модуль `A` не импортирует внутренности модуля `B` — только через `*/external/*-external.service.ts`. См. `01-architecture.md`.
5. **Схема БД — SQL, а не ORM-генерёнка.** Миграции пишутся руками. Сущности TypeORM — только для чтения/записи. См. `04-repositories-and-persistence.md`.
6. **Транзакции явные, идемпотентность явная.** `runInTransactionResult` + `RedlockService` + `AdvisoryLockService`. См. `05-transactions-and-locks.md`.
7. **События идут через outbox.** Никаких прямых `rabbitProxy.emit()` из бизнес-логики. См. `06-outbox-and-events.md`.
8. **Чувствительные данные шифруются envelope-паттерном.** DEK + KEK + AAD. Никакого «шифрования одним ключом». См. `07-encryption-and-secrets.md`.
9. **FSM — явные.** Переходы статусов валидируются, а не раскиданы по `if`-ам. См. `11-state-machines.md`.
10. **Use-case — точка сборки, не имплементации.** Handler оркеструет бизнес-операцию через repositories, domain-сервисы и sub-handlers. Не знает форму raw-row БД, не оркеструет шифрование вручную, не держит доменные парсеры. См. `14-use-case-boundaries.md`.
11. **Логи — не отладка, а контракт наблюдаемости.** Каждая бизнес-фаза — event из enum'а (`DocumentEvent.UPLOAD_RECEIVED`), не строка. Логирование — прямой вызов `this.logger.X({ event, ... })` в теле метода. Никакого Buffer/PII/ciphertext в payload. См. `15-logging-and-observability.md`.

## Оглавление

| # | Файл | О чём |
|---|---|---|
| 01 | [architecture.md](01-architecture.md) | Слои, bounded contexts, структура модуля |
| 02 | [result-and-errors.md](02-result-and-errors.md) | `Result<T, E>`, error codes, naming |
| 03 | [use-cases-and-handlers.md](03-use-cases-and-handlers.md) | `UseCaseHandler`, правила handler'а |
| 04 | [repositories-and-persistence.md](04-repositories-and-persistence.md) | Repository pattern, entity, миграции |
| 05 | [transactions-and-locks.md](05-transactions-and-locks.md) | TX, Redlock, Advisory Lock |
| 06 | [outbox-and-events.md](06-outbox-and-events.md) | Outbox, event contracts |
| 07 | [encryption-and-secrets.md](07-encryption-and-secrets.md) | Envelope encryption, KMS, AAD |
| 08 | [api-and-dto.md](08-api-and-dto.md) | Controllers, presentation service, DTO, Swagger |
| 09 | [config-and-env.md](09-config-and-env.md) | `validateEnv`, class-validator |
| 10 | [code-style.md](10-code-style.md) | TypeScript, именование, размер, комментарии |
| 11 | [state-machines.md](11-state-machines.md) | Явные FSM, валидация переходов |
| 12 | [code-voice.md](12-code-voice.md) | **Code voice** — идиомы проекта, декомпозиция, ритм, форма Result-композиции, micro-rhythm, комментарии, DB/Redis wrapper'ы. 92 правила с file:line |
| 13 | [dto-patterns.md](13-dto-patterns.md) | **DTO patterns** — naming, структура директорий, валидация, Swagger, вложенность, compliance cards. 50 правил с file:line |
| 14 | [use-case-boundaries.md](14-use-case-boundaries.md) | **Use-case boundaries** — content responsibility: max injects, no infra types, no envelope-encryption orchestration, no domain parsers as utilities, scatter → domain service. 11 правил |
| 15 | [logging-and-observability.md](15-logging-and-observability.md) | **Logging & observability** — pino + CLS, event-taxonomy, прямой `this.logger.X({ event })` в теле метода, event-enum'ы в handler'ах, redact PII/ciphertext, scoring per слой (L1-L4). 12 правил |

## Правило ревью

Если PR нарушает что-то из этих файлов — **либо PR правится, либо сначала правится спецификация** (с обоснованием). Молча расходиться со спекой нельзя.
