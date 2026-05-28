# 15. Logging и observability

## Контекст

Match-backend обязан давать **полную трассируемость** каждой бизнес-операции через логи. Это не «дебаг-хелпер» — это основной инструмент диагностики в dev (нативный запуск `just dev-app`, terminal scrollback теряется при reload) и в prod (k8s stdout + Loki/Grafana). Без дисциплины логирования любая ошибка в проде — многочасовой детектив по grep'у.

Эта спека регулирует **что, где и как** логируется. Она не про конфиг pino — это `src/infrastructure/logger/logger.module.ts`.

## Связь с R07 (encryption)

R07 запрещает попадание в логи секретов, JWT, ciphertext, DEK, PII, расшифрованных compliance-полей. R15 **усиливает** это через:
1. Машинный redaction в pino-конфиге (whitelist'ом полей)
2. Правила «что можно класть в payload» ниже

## Техническая база

| Компонент | Файл | Роль |
|---|---|---|
| `LoggerModule` | `src/infrastructure/logger/logger.module.ts` | `@Global`, монтирует pino + CLS |
| `DocumentEvent` / другие event-enum'ы | `src/infrastructure/logger/document-event.ts` | Замороженная таксономия имён событий |
| `eventBuilder` | `src/infrastructure/logger/log-event.builder.ts` | Типизированная factory для handler-level domain-событий с whitelist полей |
| CLS middleware | внутри `LoggerModule` | `requestId` в каждой строке request-scope |

**Redaction** — встроен в pino-транспорт. Paths: `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, `*.password`, `*.token`, `*.dek`, `*.aad`, `*.ciphertext`, `*.body`, `*.buffer`. Расширяется при необходимости в `logger.module.ts`.

**Транспорты** — JSON-файл всегда (`logs/match-backend.log`), stdout pretty если `LOG_PRETTY=true`, иначе stdout JSON. Ротация/Loki/Sentry добавляются конфигом без правки кода.

---

## Правила по слоям

### LOG-01: Infrastructure services — error-path логируется вручную в теле метода

**Rule:** Каждый публичный метод `src/infrastructure/**/*.service.ts` и `src/modules/*/infrastructure/**/*.service.ts`, который делает внешний I/O (HTTP, S3, KMS, SMTP, RabbitMQ, DB через raw query), при `Result.err` или throw в `fromAsyncThrowable` логирует структурированную строку через `this.logger.error({ event: '<subsystem>.<action>.failed', error, ...whitelist })`.

**Success-path не логируется** — это шум. Корреляция операции с бизнес-контекстом обеспечивается handler'ом (R15 LOG-02), который пишет доменное событие на той же фазе.

**Example:** `src/modules/extractor/infrastructure/api/extractor.service.ts` — `logger.error({ msg: 'extractor submit timeout', url, partnerId })` в timeout-ветке `submitDocument`.

**`operation` naming:** `<subsystem>.<action>` через точку, kebab-case в сегментах. Примеры: `s3.upload`, `s3.delete`, `extractor.submit`, `extractor.poll`, `kms.encrypt-dek`, `smtp.send`. Финальный event для error — `<subsystem>.<action>.failed`.

**Whitelist полей в payload:**
- Идентификаторы, ключи S3, размеры, content-type — можно
- Buffer, Body, ciphertext, DEK, AAD, токены, тела ответов внешних API — нельзя
- Примитивы или плоские объекты — не вложенные структуры
- `error` — error code строкой из `Result.err` (см. LOG-11), не Error-объект

**Anti-pattern:**
- Ручное логирование `start` / `ok` на каждый успешный вызов — заваливает логи без полезной информации
- `this.logger.error(error)` без `event` — не грепается, не видно в дашбордах
- Логирование raw response body или request payload вместо whitelist полей

### LOG-02: Handlers — доменные события в поворотных точках

**Rule:** Handler (use-case) логирует **фазы бизнес-операции** через event-enum из `src/infrastructure/logger/`. Не `logger.info('started processing')` — только `logger.info({ event: DocumentEvent.UPLOAD_RECEIVED, ... })`.

**Минимальный набор точек для `run()`:**
1. **Вход** — `<flow>.received` с основными параметрами запроса (entity IDs, counts, totals)
2. **Валидация пройдена / отклонено** — `<flow>.validated` или `<flow>.rejected` с причиной
3. **Критический side-effect выполнен** — `<flow>.persisted`, `<flow>.published`, `<flow>.attached`, и т.д.
4. **Side-effect провалился** — `<flow>.failed` с `error` (error code из `Result.err`)

**Example:** `src/modules/partner/use-case/onboarding/upload-partner-documents/upload-partner-documents.handler.ts`.

**Event-enum'ы живут в `src/infrastructure/logger/<domain>-event.ts`.** Текущие:
- `DocumentEvent` — upload / storage / record / attached / extraction

**Новые enum'ы добавляются при появлении нового flow:** `IntentEvent`, `DealEvent`, `TransferEvent`, `OnboardingEvent`, `AuthEvent` — по мере роста кода.

**Anti-pattern:** `logger.info('saved document')` — строковый event теряется при грепе. Всегда enum-литерал.

### LOG-03: Repositories — error-path обязателен, success-path опционален

**Rule:**
- **Ошибка DB** (`fromAsyncThrowable.isErr()`, distinct от бизнес-miss типа «user not found») → `logger.error({ event: '<repo>.<method>.failed', ... })` с error code и ключевыми параметрами запроса (НЕ содержимым передаваемых полей).
- **Успешный path** логировать **не нужно** — слишком шумно, и CLS requestId + HTTP-лог дают контекст. Исключение — операция долгая (>50ms ожидаемо) или критична для аудита: тогда одна явная строка `logger.info({ event: '<repo>.<method>.completed', durationMs, ... })` после успеха.

**Anti-pattern:** `logger.info('created user')` на каждый insert — заваливает логи.

### LOG-04: Controllers и presentation-services — не логируют вручную

**Rule:** `@Controller` и `*-presentation.service.ts` **не содержат** `logger.X(...)` вызовов. HTTP-цикл логирует `pino-http` автоматически. Маппинг `Result.error → HttpException` тоже попадает в HTTP-лог через статус ответа.

**Exception:** critical auth-events (successful sign-in, token refresh, admin impersonation) — допустимо `logger.info({ event: AuthEvent.SIGN_IN_OK, userId })` в presentation-service. Но не более 1–2 строк на метод.

**Anti-pattern:** `logger.info('received upload request')` в controller — дублирует pino-http.

### LOG-05: Domain services — доменные event-фазы вручную

**Rule:** Domain-сервис (по R14 UC-05), оркеструющий запись в >3 таблицы, логирует доменные фазы scatter-операции через event-builder и `this.logger.X({ event, ... })`, как обычный handler. Это даёт читаемую цепочку «принято → разложено в таблицы X, Y, Z → ошибка на фазе W» без рассказа о каждой вставке.

**Минимум:** `<module>.<operation>.received` на входе и `<module>.<operation>.persisted` или `.failed` на исходе.

**Example (будущий):** `PartnerComplianceScatterService.scatterDraftIntoComplianceProfile` → `logger.info({ event: 'partner.compliance-scatter.received', draftId })` на входе, `logger.info({ event: 'partner.compliance-scatter.persisted', draftId, complianceProfileId, cardsCount })` на успехе, `logger.error({ event: 'partner.compliance-scatter.failed', draftId, error })` на ошибке.

**Anti-pattern:** логировать каждый `repository.upsert(...)` внутри scatter-операции — это уровень repository (LOG-03), не domain-сервиса.

### LOG-06: Запрещённый контент в логах

**Rule:** Никогда не попадает в лог — ни прямо, ни через spread объекта:
- `password`, `passwordHash`, JWT (access/refresh), `otp`, `totpSecret`
- `dek`, `kek`, `aad`, любой ciphertext (`Buffer` с encrypted content)
- Расшифрованные compliance-поля (UBO ФИО, паспортные данные, адреса, tax IDs)
- `Buffer` с содержимым файла при upload
- Весь `request.body`, `response.body` целиком

**Уровни защиты (все должны работать):**
1. Whitelist в `extract`/event payload — класть только нужные поля
2. Redaction в pino-конфиге — на случай если что-то проскочило через spread
3. Code review — явно проверять при ревью handler'ов с PII

**Anti-pattern:** `logger.info({ ...params })` где `params` содержит поле с Buffer или PII. Всегда явный whitelist полей.

### LOG-07: Event naming taxonomy

**Rule:** Имена event'ов строятся по правилу `<domain>.<subject>.<action-or-state>`. Всё lowercase kebab внутри сегментов, через точку — сегменты.

**Examples:**
- `document.upload.received` — вход
- `document.storage.persisted` — бинарь в S3
- `document.record.created` — строка в БД
- `document.extraction.queued` → `.polled` → `.completed` → `.failed`
- `document.attached` / `.detached`
- `auth.sign-in.ok` / `auth.sign-in.rate-limited`
- `intent.state.changed`

**Anti-pattern:** `DOCUMENT_UPLOADED`, `documentCreated`, `'upload done'` — нестабильный, грепается плохо, тяжело унифицировать дашборды.

### LOG-08: Обязательные поля в payload доменного event'а

**Rule:** Каждая event-строка в handler'е содержит:
- `event` — литерал из enum'а (обязательно)
- Как минимум один entity ID в контексте (`partnerId`, `intentId`, `documentId`, `userId`, и т.д.)
- `durationMs` — если event фиксирует завершение длительной фазы (≥50ms ожидаемо)
- `error` (error code строкой) — только в `*.failed` event'ах

**Что НЕ обязательно:** `timestamp` (pino ставит автоматически), `requestId` (CLS добавляет), `level` (из метода).

### LOG-09: `new Logger(ClassName.name)` — канонический способ инстанциирования

**Rule:** Следуя R12 CV-30, логгер объявляется как `private readonly logger = new Logger(ClassName.name)`. Это работает после `app.useLogger(...)` в `main.ts` — под фасадом живёт pino со всеми транспортами, redaction и CLS-context.

**Exception:** если классу реально нужен `PinoLogger.setContext()` (динамический контекст, редкий случай — sub-handler'ы с общим parent-scope), можно инжектить `PinoLogger` через DI + `setContext(ClassName.name)` в конструкторе. Такие места помечаются комментарием-однострочником зачем DI, а не `new Logger`.

**Anti-pattern:** смешивание в одном классе `new Logger(...)` и инжекта `PinoLogger` через DI. Один паттерн на класс.

### LOG-10: `console.log` / `console.error` запрещены

**Rule:** `console.*` вызовы в `src/` — автоматическое нарушение. Уже есть в R10, здесь подтверждается усиленно: `console.log` обходит pino, не попадает в файл, не имеет requestId.

**Единственное tolerated место:** `src/infrastructure/db/datasource.ts:7` — tracked в baseline, исправляется отдельным коммитом.

### LOG-11: Error code — строка, не stack trace

**Rule:** В `logger.error({ error, ... })` поле `error` — это **строковый error code** из `Result.err` (например, `'UPLOAD_PARTNER_DOCUMENTS_S3_UPLOAD_ERROR'`). Не объект `Error`, не `error.stack`, не `error.message`.

**Why:** error codes грепаются, trace'ы — мусор в logs Loki. Если нужен stack trace от throwable-ошибки, она уже поймана `fromAsyncThrowable` → сохраняется в pino через отдельное поле `err` (pino stdlib сериализует Error автоматически), но это инфраструктурная деталь, не handler-ответственность.

### LOG-12: Не логировать одно и то же дважды

**Rule:** Одна бизнес-фаза — один event. Handler не логирует «upload received» и «upload validated» если между ними нет реальной фазы. Если handler уже пишет доменное событие `document.storage.persisted` после успеха `s3Service.upload(...)`, отдельное `s3.upload.completed` не нужно — handler-event несёт `documentId` + `s3Key`, s3-сервис в success-ветке молчит (LOG-01). На failure эти два уровня **не дублируют друг друга**: s3-сервис пишет `s3.upload.failed` с инфраструктурными деталями, handler пишет `document.storage.failed` с доменным `documentId`.

**Как читать в Loki:** одна и та же ошибка даст две строки с одним `requestId` (CLS) — инфра-уровень и доменный. По ним строится полная цепочка «что упало» (s3) и «во что это упёрлось бизнес-операцию» (document).

**Anti-pattern:** `logger.info({ event: 'document.s3.upload.start' })` + `s3Service.upload(...)` + `logger.info({ event: 'document.s3.upload.ok' })` — трижды логирует одно. Достаточно одного доменного event'а после успеха.

---

## Env-контракт

Переменные в `logger.config.ts`:

| Var | Значения | По умолчанию |
|---|---|---|
| `LOG_MODE` | `dev \| prod` | `prod` |
| `LOG_CONSOLE_LEVEL` | `fatal \| error \| warn \| info \| debug \| trace` | `info` |
| `LOG_FILE_LEVEL` | `fatal \| error \| warn \| info \| debug \| trace` | `trace` |
| `LOG_FILE` | путь; пустая строка отключает файл | `logs/match-backend.log` |

Режимы непересекающиеся:

- **`dev`** — pretty stdout (фильтруется `LOG_CONSOLE_LEVEL`, минимальный пейлоуд) + JSON-файл `LOG_FILE` (фильтруется `LOG_FILE_LEVEL`, полный пейлоуд). Уровни развязаны — консоль для глаз, файл для grep'а.
- **`prod`** — один JSON stdout с полным пейлоудом (фильтруется `LOG_CONSOLE_LEVEL`), без файла. `LOG_FILE_LEVEL` и `LOG_FILE` в этом режиме игнорируются, но должны быть объявлены в kustomization/`.env.example` по правилу R09 — иначе валидатор на новых деплоях может ругнуться и под упадёт.

Источники значений:

- **`logger.config.ts`** — единственный источник дефолтов (`LOG_MODE=prod`, `LOG_CONSOLE_LEVEL=info`, `LOG_FILE_LEVEL=trace`, `LOG_FILE=logs/match-backend.log`). Все поля `@IsOptional` — ни одна переменная не обязана присутствовать во внешнем окружении.
- **`justfile`** → `dev-apps` / `dev-backend` экспортят `LOG_MODE=dev` + `FORCE_COLOR=1` (последнее нужно, потому что вывод пайпится через `sed` и перестаёт быть TTY, из-за чего `pino-pretty` по умолчанию гасит цвета). Это единственное место, где для локального запуска проставляется режим.
- **`deploy/{dev,prod}/kustomization.yaml`** — все четыре переменные перечислены явно (`LOG_MODE=prod`, уровни, пустой `LOG_FILE`), чтобы kustomize не зависел от дефолтов кода.
- **`.env.example`** — раздел LOGGER содержит только ссылку на этот механизм: локальный `.env` переменные не держит.

По R09 консистентность сохраняется: имена идентичны во всех слоях, логика (кто и когда ставит) явно документирована.

---

## Scoring (для `/log-coverage`)

Каждый **бизнес-модуль** (`src/modules/<name>/`) оценивается по четырём субскорам:

| ID | Субскор | Max | Что проверяется |
|---|---|---|---|
| L1 | Infrastructure error-path | 3 | I/O-методы infra-сервисов логируют `Result.err` через `logger.error({ event: '<subsystem>.<action>.failed', error, ... })` |
| L2 | Handler event coverage | 4 | Handlers имеют ≥2 event-точек (minimum: received + persisted/failed), используют event-enum, не строковые литералы |
| L3 | Error-path coverage | 2 | Repository DB-ошибки и handler fail-branch'и логируются структурированно |
| L4 | Safety | 1 | Никакого Buffer/PII/ciphertext/secret в payload; нет `console.*`; нет смешения `new Logger` + `PinoLogger` в одном классе |

**Штрафы:** каждое нарушение L1/L2/L3 — −1 pt в соответствующей категории. Нарушение L4 (попадание PII/Buffer в лог) — −3 pt (критично), плюс автоматическая пометка модуля как **UNSAFE**.

**Overall score модуля:** `sum(subscores) / 10 × 10` (0–10).

**Overall score проекта:** weighted average модулей, где вес = число файлов в scope модуля. Инфраструктурные сервисы (`src/infrastructure/`) оцениваются как отдельный «модуль» с теми же субскорами.

---

## Чек-лист при добавлении нового flow

- [ ] Создан event-enum в `src/infrastructure/logger/<domain>-event.ts` с именами по LOG-07
- [ ] Handler логирует ≥2 event-точек (received + persisted/failed минимум)
- [ ] Infra-методы под handler'ом логируют error-ветку через `logger.error({ event: '<subsystem>.<action>.failed', error, ... })`
- [ ] Payload логов — whitelist: только IDs, counts, sizes, enum-значения
- [ ] Нет Buffer, ciphertext, PII, secrets в payload
- [ ] Error code в `*.failed` event'ах — строкой из `Result.err`, не `Error`-объектом
- [ ] Логгер инстанциируется как `new Logger(ClassName.name)` (исключения — с обоснованием)
- [ ] Controllers / presentation-services не добавляют ручных `logger.X` вызовов
- [ ] Новые event-enum'ы перечислены в `.claude/context/modules.md` (event-taxonomy секция)

## Чек-лист на ревью (LOG_checks)

- [ ] `console.*` отсутствует в diff
- [ ] Нет `logger.info('plain string')` — только `{ event, ... }`
- [ ] Event'ы из enum, не строковые литералы
- [ ] Нет spread объектов с Buffer/PII в payload
- [ ] Длительные операции (>50ms ожидаемо) явно фиксируют `durationMs` в `*.completed` event'е
- [ ] Redact-paths в `logger.module.ts` покрывают новые потенциально-чувствительные поля
