# Playbook: log-coverage

Инструкция для команды `/log-coverage [scope]`. Оценивает **покрытие логами** по правилам R15.

## Вход

- `[scope]` — опциональный путь (`src/modules/auth`, `src/infrastructure/rabbitmq`). Без аргумента — вся `src/` с разбивкой по модулям.

## Отличие от `/spec-audit`

`spec-audit` — полный спек-аудит по всем R-правилам. `log-coverage` — **узкий** скоринг по **R15** с разбивкой по слоям. Быстрее, сфокусирован на observability, даёт практические приоритеты «где добавить логи».

## Алгоритм

### Фаза 1: Resolution

Собери scope-файлы:
- **Без аргумента**: все директории `src/modules/*/` + `src/infrastructure/*/` — каждая оценивается как отдельный «модуль»
- **С путём**: рекурсивно все `.ts` файлы под путём, сгруппированные по под-модулям если scope — `src/modules/`

Отфильтруй:
- `*.module.ts`, `*.entity.ts`, `*.dto.ts`, `*.errors.ts`, `*.config.ts`, `*.types.ts`, `*.utilities.ts` — структурный шум
- `*.spec.ts`, `*.e2e-spec.ts` — тесты
- `src/lib/*` — кроме случая, когда scope явно на него

Классифицируй оставшиеся файлы по типу из `manifest.yaml → file_types`:
- `handler` — участвует в L2
- `infrastructure_service` — участвует в L1
- `repository` — участвует в L3
- `domain_service` — участвует в L1 (если scatter) и L3 (если ошибки)
- `controller`, `presentation_service` — участвует в L4 (проверка «не логирует вручную»)

### Фаза 2: Per-module scoring

Для **каждого модуля** (`src/modules/<name>/` или каждая поддиректория `src/infrastructure/`) собери четыре субскора.

#### L1 — Infrastructure error-path coverage (max 3 pts)

Для каждого `*.service.ts` в `infrastructure/` модуля:
- Собери все публичные `async` методы с I/O (вызов AWS SDK, HTTP-клиента, TypeORM raw query, amqplib), которые возвращают `Result<T, E>` с err-вариантом
- Для каждого такого метода проверь: в каждой ветке `return err(...)` после реального side-effect failure стоит `this.logger.error({ event: '<subsystem>.<action>.failed', error, ... })` непосредственно перед?

Подсчёт:
- Если модуль не имеет infrastructure-сервисов → L1 = 3 (N/A)
- Процент покрытия P = (methods_with_error_log / total_io_methods)
- Subscore = round(P × 3, 1)

**Нарушения:**
- I/O-метод с err-веткой, но без структурированного `logger.error` → error, −1 pt каждый
- `logger.error(error)` без поля `event` (нечитаемо в Loki) → warning, −0.5 pt
- `event` без формата `<subsystem>.<action>.failed` (произвольный текст) → warning, −0.5 pt
- В payload — Buffer/PII/raw response body → **L4 penalty** (не L1)
- Лишние success-логи `logger.info` на каждый успешный вызов → warning, −0.5 pt (нарушает LOG-01: success молчит)

#### L2 — Handler event coverage (max 4 pts)

Для каждого `*.handler.ts` в `use-case/**`:

Проверки (каждая приносит баллы, суммарно до 4):

1. **Есть хотя бы один `logger.X({ event: <Enum>.X })` вызов** → +1 pt, иначе 0
2. **Есть event-точка на входе (`run()` начинается с `received`-event)** → +1 pt
3. **Есть event-точка на success-path (≥1 из `persisted/published/attached/created/completed`)** → +1 pt
4. **Есть event-точка на fail-path (`failed`-event в каждой ветке с `return err(...)`, где произошёл реальный side-effect)** → +1 pt

**Критичные нарушения:**
- Event — строковый литерал, не из enum → warning, −0.5 pt
- `logger.info('plain string')` без `{ event }` → warning, −0.5 pt
- Handler вообще без логов при длине `run()` > 30 строк → error, −1 pt

#### L3 — Error-path coverage (max 2 pts)

Для каждого `*.repository.ts`:
- Проверь: каждый метод, возвращающий `*_DB_ERROR`, в ветке ошибки вызывает `this.logger.error({ ... })`?
- Если ≥80% методов покрыты → +1.5 pt
- Если 100% → +2 pt

Для каждого handler'а:
- Проверь: каждая ветка с `return err('*_S3_UPLOAD_ERROR')`, `'*_DB_ERROR'`, `'*_EXTRACTOR_ERROR'` (именно side-effect failures) имеет `logger.error` перед `return`?
- Если все покрыты → бонус к L3, но не выше max=2

#### L4 — Safety (max 1 pt)

**Boolean check — либо 1, либо 0 (или −3 штраф):**
- Нет `console.log` / `console.error` / `console.warn` в файлах модуля → OK
- Нет `logger.X({ ...params })` где `params` содержит `Buffer`, или поле с `_enc` / `_hash` / `password` / `token` / `dek` / `aad` / `ciphertext` → OK
- Нет смешения `new Logger(...)` + `PinoLogger` DI в одном классе → OK
- Controllers и presentation-services не вызывают `logger.X` (кроме auth-event exception из LOG-04) → OK

Если все чисто → L4 = 1.

Если нарушение по **Buffer/PII/secret в payload** → L4 = −3 (штраф ниже нуля) + модуль помечается **UNSAFE** (выделяется в отчёте).

Иные нарушения L4 → L4 = 0.

**Module score = clamp(L1 + L2 + L3 + L4, 0, 10)**.

### Фаза 3: Overall scoring

```
overall_score = Σ(module_score_i × weight_i) / Σ(10 × weight_i) × 100
weight_i      = число файлов модуля в scope (handlers + services + repositories)
```

### Фаза 4: Top-N приоритеты

Отсортируй все нарушения по:
1. UNSAFE-модули — всегда top-1 priority
2. Модули с L2 < 1 (handler'ы без events) — добавить базовое покрытие
3. L1 < 2 — infra-методы с err-ветками без структурированного `logger.error({ event: '...failed', ... })`
4. L3 < 1 — error-path

Top-5 конкретных рекомендаций: `<file>:<line>` + что добавить.

## Формат отчёта

```markdown
# log-coverage report — <date>

**Scope:** <src/ | конкретный путь>
**Overall score:** 62.4 / 100
**Previous:** 58.1 (если есть baseline в .claude/reports/)
**Δ:** +4.3 ✓
**UNSAFE modules:** 0

---

## Scores по модулям

| Модуль | L1 infra | L2 handler | L3 errors | L4 safety | **Total** |
|---|---|---|---|---|---|
| partner | 3.0 | 3.5 | 1.5 | 1.0 | **9.0** |
| intent | 1.0 | 1.0 | 0.5 | 1.0 | **3.5** |
| auth | 2.5 | 2.0 | 1.5 | 1.0 | **7.0** |
| admin | 0.0 (N/A) | 0.5 | 0.5 | 1.0 | **2.0** |
| transfer | 0.0 | 0.0 | 0.0 | 1.0 | **1.0** |
| ... | | | | | |
| **infrastructure/s3** | 3.0 | N/A | N/A | 1.0 | **10.0** |
| **infrastructure/extractor** | 0.0 | N/A | N/A | 1.0 | **3.0** |
| **infrastructure/smtp** | 0.0 | N/A | N/A | 1.0 | **3.0** |

## UNSAFE modules

*(Если есть: список + конкретные места с Buffer/PII/secret в логах)*

Нет.

## Top-5 приоритетов

1. **`modules/intent`** — L2=1.0. Handler'ы upload-originator/beneficiary-package не имеют ни одного event-лога. Добавить минимум 4 точки: `compliance-package.upload.received`, `.validated`, `.persisted`, `.failed`. Создать `intent-event.ts`.
2. **`infrastructure/extractor`** — L1=0. `ExtractorService.submitJob`, `.getJobStatus` не пишут структурированный error в HTTP-status err-ветках. Добавить `logger.error({ event: 'extractor.submit.failed', error, partnerId, idempotencyKey })` / `'extractor.poll.failed'` перед каждым `return err(...)`.
3. **`modules/transfer`** — L1=L2=L3=0. Модуль ещё в заглушках (см. baseline R04), при имплементации applying R15 сразу.
4. **`modules/auth/use-case/presentation/sign-in`** — есть логи но не через event-enum. Создать `auth-event.ts` и перевести на `AuthEvent.SIGN_IN_*`.
5. **`infrastructure/smtp`** — `SmtpService.send` не пишет err-ветку структурированно. Добавить `logger.error({ event: 'smtp.send.failed', error, to, subject, templateId })`. Тело письма — **нет**.

## Подробные нарушения по слоям

### L1 — Infrastructure (12 нарушений)

- `src/infrastructure/extractor/extractor.service.ts:18` — `submitJob` не логирует err-ветки HTTP-статусов
- `src/infrastructure/extractor/extractor.service.ts:42` — `getJobStatus` не логирует err-ветки HTTP-статусов
- `src/infrastructure/smtp/smtp.service.ts:23` — `send` не логирует err-ветку
- ...

### L2 — Handler events (8 нарушений)

- `src/modules/intent/use-case/.../upload-originator-package.handler.ts:XX` — handler не имеет event-логов
- ...

### L3 — Error paths (5 нарушений)

- ...

### L4 — Safety (0 нарушений)

Нет UNSAFE-содержимого в логах. Нет `console.*` в src/ (кроме tracked `datasource.ts:7`).

## Сравнение с baseline

*(Если есть — табличка delta по модулям)*

---

## Сохранение

Сохранить отчёт в `.claude/reports/<date>-log-coverage.md`? (y/n)
```

## Правила поведения

- **Отчёт не исправляет код.** Только собирает данные.
- **Резолвинг явен.** Если scope неоднозначный — спроси пользователя.
- **Grep — основной инструмент.** Используй `Grep` для поиска `logger.`, `console.`, event-enum'ов, `return err(`. Не читай все файлы подряд.
- **Читай handler'ы целиком** только когда считаешь L2 для конкретного handler'а — там нужен контекст фаз.
- **Не читай `src/lib/*`** при scan'е — это не часть бизнес-кода (кроме случая, когда scope явно на lib).
- **UNSAFE-флаг — binary.** Если нашёл Buffer/ciphertext/PII в логе — модуль UNSAFE независимо от остальных субскоров.
- **Не делай предположений про «будущее покрытие».** Оцениваешь то, что есть в коде сейчас.

## Управление контекстом

Для большого scope (весь `src/`):
1. Первый проход — Grep'ом найди все `logger.`, `console.`, `return err(` — получи карту
2. Второй проход — читай handler'ы точечно для L2 (обычно ~20-40 файлов)
3. Собирай статистику в память, не в промежуточные файлы
4. Генерируй отчёт в конце

Если модулей много — можно спавнить под-агент для скан'а отдельного модуля и агрегировать результаты.

## Связь со `/spec-*` командами

- `/log-coverage` — узкий, фокус на R15
- `/spec-audit` — включает R15 как один из R-правил, но менее детальный по observability
- При смене спеки (новые event-enum'ы, новые redact-paths, новые error-ветки) — `log-coverage` первым показывает impact

## Periodicity

`/log-coverage` запускается:
- После добавления нового handler'а / infra-сервиса — локальная проверка
- Перед merge большой feature-ветки — гарантия observability
- Раз в спринт для регрессионного мониторинга (сохранение в `.claude/reports/`)
- После расширения `DocumentEvent` / других event-enum'ов — видно, где enum ещё не применён
- После добавления нового infra-сервиса с I/O — проверка, что err-ветки логируются по LOG-01
