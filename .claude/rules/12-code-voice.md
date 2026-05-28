# 12. Code voice — идиоматика проекта

Этот файл — **каталог идиом** match-backend, извлечённых из реальной кодобазы. Он не про TypeScript в общем и не про best practices в вакууме. Он про то, **как пишут код именно в этом проекте**, чтобы новый файл был неотличим от существующего по ритму, форме и вкусу.

## Область применения

- **Регулируется:** control flow, декомпозиция, naming промежуточных переменных, форма параметров, empty lines, использование `switch`/`if`/`for`/`.map`, шаблоны Result-композиции, shape данных (`Map` vs `Record`), инкапсуляция, micro-rhythm внутри блоков, комментарии в нетривиальных местах, паттерны Redis/DB wrapper'ов.
- **Не регулируется:** отступы, кавычки, trailing commas — это работа Prettier. Общий naming (camel/Pascal/snake) — R10. **DTO patterns** — отдельный файл R13 (`13-dto-patterns.md`).

## Эталонные файлы (gold standard)

Эти файлы — **самые консистентные в кодбазе**. Перед созданием нового кода аналогичного типа — открой эталон и сверяйся с ним **буквально**.

| Тип | Эталон |
|---|---|
| Простой handler | `src/modules/user/use-case/create-user/create-user.handler.ts` |
| Handler с params-типом | `src/modules/encryption/use-case/envelope-encrypt/envelope-encrypt.handler.ts` |
| Сложный handler (lock + rate-limit + sub-handlers + switch) | `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts` |
| Repository | `src/modules/user/infrastructure/repositories/user/user.repository.ts` |
| Infrastructure service с type guards | `src/infrastructure/redis/redlock/redlock.service.ts` |
| Documented library service | `src/modules/encryption/infrastructure/encryption/encryption.service.ts` |
| External service (модульный фасад) | `src/modules/user/external/user-external.service.ts` |

---

## 1. Control flow

Общее впечатление: **плоский, линейный, без else**. Ранний возврат, никогда nested-if'ов на одном уровне абстракции.

### CV-01: Early return, никогда `else`
**Rule:** После проверки `if (x.isErr()) return err(...)` дальнейший код идёт на верхнем уровне. Else-блоки не используются.
**Example:** `src/modules/user/use-case/create-user/create-user.handler.ts:16-22`
**Anti-pattern:** `if (x.isErr()) { return err(...); } else { return ok(...); }` — в кодбазе не встречается.
**Why:** минимум отступов, линейная читаемость.

### CV-02: `switch` — только для exhaustive enum, каждый `case` — `return`, обязательный `default`
**Rule:** `switch` появляется, когда нужно разветвить логику по строковому enum (discriminated union). В каждом `case` — `return`, `break` не используется. `default` обязателен и возвращает `err('..._INTERNAL_ERROR')`.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:128-142` (`switch (challengeType)`)
**Anti-pattern:** `switch` над строковыми литералами без enum, fall-through, отсутствие `default`.
**Why:** TS strict + exhaustive check ловит незакрытый case.

### CV-03: Тернарный оператор — только для выбора значения
**Rule:** Тернарный оператор используется для выбора между двумя простыми значениями (enum, дата, примитив). Не используется для условного вызова handler'а или ветки логики.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:124-126` — `const challengeType = authUserProfile.totpEnabled ? AuthChallengeType.TOTP : AuthChallengeType.EMAIL;`
**Anti-pattern:** вложенные тернарники, тернарник как возврат handler'а.

### CV-04: Вложенность не глубже 3 уровней
**Rule:** Если внутри `run()` появляется 4-й уровень отступов — логика выделяется в sub-handler.
**Example:** `SignInHandler.run` остаётся плоским (rate-limit → redlock → последовательные await'ы) несмотря на 160 строк.
**Anti-pattern:** `if` внутри `if` внутри `if` внутри `if`.

### CV-05: Guard clause на «нет значения» — `if (!x.value) return err(...)`
**Rule:** После `if (result.isErr()) return err(...)` — если возможен `undefined` в `value`, сразу `if (!result.value) return err(...)`, затем `const x = result.value` гарантированно не undefined.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:67-74`
**Anti-pattern:** доступ к `result.value!` (non-null assertion) или nullable checks ниже по коду.

---

## 2. Error handling и Result composition

Общее впечатление: **абсолютная дисциплина**. Никогда `throw`, никогда `try/catch` в бизнес-коде, никогда `.map()`/`.andThen()`/`.match()` — только явные `if (isErr()) return err()`.

### CV-06: Канонический паттерн распаковки Result
**Rule:** После `await` — `if (result.isErr()) return err(result.error)`, затем (если value нужен далее) `const x = result.value` отдельной строкой.
**Example:** `src/modules/user/use-case/create-user/create-user.handler.ts:16-22`
**Second example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:64-74`
**Anti-pattern:** распаковка `const x = result.value` **до** проверки `isErr`, использование `.match()`/`.andThen()`/`.map()`.

### CV-07: Именование промежуточных результатов — `<verb><Noun>Result`
**Rule:** Переменная, принимающая значение от `await handler.run(...)` или `await repo.method(...)`, именуется как `<verb><Noun>Result`. Verb — операция (`create`, `find`, `verify`, `generate`, `encrypt`), Noun — объект (`User`, `Hash`, `DataEncryptionKey`).
**Examples:**
- `const createResult = await this.userRepository.create(...)` — `user.repository.ts`
- `const findUserResult = await this.userExternalService.findByEmail(...)` — `sign-in.handler.ts:64`
- `const verifyHashResult = await this.hashService.verify(...)` — `sign-in.handler.ts:92`
- `const generateDataEncryptionKeyResult = await this.kmsService.generateDataEncryptionKey()` — `envelope-encrypt.handler.ts:34`

**Anti-pattern:** `result`, `res`, `data`, `output`, `r`.

### CV-08: Распакованное значение — без суффикса, именуется по сути
**Rule:** После `if (result.isErr()) return err(...)` распаковка: `const user = findUserResult.value;`. Имя — по типу/роли, не по тому, откуда пришло.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:74,86` — `const user = ...`, `const authUserProfile = ...`
**Anti-pattern:** `const userResult = findUserResult.value;`, `const userValue = ...`.

### CV-09: Error codes — `<OPERATION>_<SUB-NAMESPACE>_<REASON>` в SCREAMING_SNAKE_CASE
**Rule:** Error code — строковый литерал. Канонический формат — двухуровневый namespace `<OP>_<SUB>_<REASON>`. Одноуровневый `<OP>_<REASON>` допустим для простых операций без фаз. **Полный каталог suffixes и правило `_ERROR` catch-all — в R02 правило №2.**
**Examples:**
- `'CREATE_USER_CONFLICT'`, `'CREATE_USER_DATABASE_ERROR'` (`user.repository.errors.ts`) — одноуровневый
- `'ENCRYPT_DATA_INVALID_KEY_LENGTH'`, `'ENCRYPT_DATA_ERROR'`, `'ENCRYPT_NORMALIZE_AAD_ERROR'` (`encryption.errors.ts`) — двухуровневый, с catch-all `_ERROR` на уровне sub-namespace'а
- `'ACTIVATE_ACCOUNT_FIND_ACTIVATION_DB_ERROR'`, `'ACTIVATE_ACCOUNT_FAIL_TX_ERROR'` (`activate-account.errors.ts`) — двухуровневый по фазам
- `'LOCK_NOT_ACQUIRED'`, `'LOCK_PARTIAL_APPLY'`, `'LOCK_RELEASE_FAILED'` (`redlock.errors.ts`)

**Anti-pattern:** `'ERROR'`, `'FAILED'`, `'UNKNOWN'`, `'DB_ERROR'` без префикса операции; голый `_ERROR` без namespace'а; camelCase или kebab-case; один union на весь модуль.

### CV-10: Иерархия `.errors.ts` файлов
**Rule:** Каждый слой имеет свой `*.errors.ts`. Repository → `*.repository.errors.ts`. Handler → `*.errors.ts` рядом с handler'ом. Если handler просто проксирует — делается type alias.
**Example:**
- `src/modules/user/infrastructure/repositories/user/user.repository.errors.ts:1-5` — `UserRepositoryCreateErrorCode`
- `src/modules/user/use-case/create-user/create-user.errors.ts:1-3` — `export type CreateUserErrorCode = UserRepositoryCreateErrorCode;`
**Anti-pattern:** один глобальный enum ошибок для всего модуля.

### CV-11: Union error codes при композиции sub-handler'ов
**Rule:** Если handler вызывает sub-handlers, его error code — union из ошибок sub-handler'ов + своих собственных.
**Example:** `src/modules/auth/use-case/presentation/sign-in/resolve-pending-challenge/resolve-pending-challenge.errors.ts` — `SignInEmailErrorCode | SignInTotpErrorCode | ...`
**Anti-pattern:** один общий error code на весь модуль.

### CV-12: Type guards для разделения throwable-ошибок
**Rule:** Для различения конкретных исключений внутри `fromAsyncThrowable`-результата используются функции-предикаты `isXxxError(e)`, не `instanceof`. Предикаты живут в `src/lib/` или рядом с `*.errors.ts`.
**Examples:**
- `if (isUniqueQueryError(insertResult.error))` — `user.repository.ts:27`
- `if (isAchieveQuorumError(e) || isExceededAttemptsToLockError(e))` — `redlock.service.ts:33`
**Anti-pattern:** `if (error instanceof QueryFailedError)`, `if (error.message.includes('...'))`.

### CV-13: `fromAsyncThrowable(async () => ...)()` — канонический wrapper
**Rule:** Оборачивание throwable-операций — **всегда** через `fromAsyncThrowable(async () => this.xxx.yyy(arg))()` с немедленным вызовом. Никаких `.bind(this)`.
**Examples:**
- `src/modules/user/infrastructure/repositories/user/user.repository.ts:23-25`
- `src/infrastructure/redis/redlock/redlock.service.ts:28-30`
- `src/infrastructure/db/advisory-lock/advisory-lock.service.ts:22-26`
**Anti-pattern:** `fromAsyncThrowable(this.repo.insert.bind(this.repo))`, прямой `try/catch`.

### CV-14: `Result.combine` для batch-операций с Result'ами
**Rule:** Когда нужно применить Result-возвращающую операцию к массиву и собрать все результаты — `Result.combine(arr.map(item => operation(item)))`.
**Example:** `src/modules/encryption/use-case/envelope-encrypt-many/envelope-encrypt-many.handler.ts:43-51`
**Anti-pattern:** `for`-loop с накоплением в массив и ручной проверкой `isErr` на каждой итерации.

---

## 3. Async, функции и методы

### CV-15: `run()` всегда `async`, даже если внутри нет `await`
**Rule:** Метод `run()` в handler'е объявлен `async` всегда, сигнатура возвращает `Promise<Result<T, E>>`. Это держит контракт `UseCaseHandler` единообразным.
**Example:** `src/modules/user/use-case/find-user-by-id/find-user-by-id.handler.ts` — просто проксирует репозиторию, но всё равно `async`.
**Anti-pattern:** синхронный `run()`, даже если можно.

### CV-16: `async/await` везде, никогда `.then()`
**Rule:** Цепочки промисов строятся через `await`, `.then()`/`.catch()` не используется в бизнес-коде.
**Example:** все handlers и services.
**Anti-pattern:** `service.method().then(r => ...)`, `.catch(e => ...)`.

### CV-17: `Promise.all` для независимых параллельных операций
**Rule:** Когда несколько независимых операций можно запустить параллельно — `Promise.all([...])`.
**Example:** `src/modules/auth/use-case/generate-jwt/generate-jwt.handler.ts:20-32` — два `jwtService.signAsync(...)` параллельно.
**Anti-pattern:** последовательные `await` на независимые операции.

### CV-18: Return type явный на всех публичных методах
**Rule:** Return type указывается явно, не полагаемся на inference. Включая `run()`, методы repositories, публичные методы сервисов.
**Example:** `src/modules/user/use-case/find-user-by-id/find-user-by-id.handler.ts:18-20` — `async run(userId: string): Promise<Result<User | undefined, ...>>`
**Anti-pattern:** inference-only `async run(userId: string) { ... }` без сигнатуры возврата.

### CV-19: Private методы в handler'е почти не используются
**Rule:** Внутри handler'а нет приватных методов. Декомпозиция — через sub-handler'ы (отдельные классы в отдельных файлах, инжектятся).
**Example:** `SignInHandler` не имеет private методов, вместо этого инжектит `SignInEmailHandler`, `SignInTotpHandler`, `ResolvePendingChallengeHandler`.
**Anti-pattern:** `private async signInViaEmail() { ... }` внутри `SignInHandler`.
**Why:** каждый sub-handler — независимо тестируем, имеет свои ошибки, свои зависимости.

### CV-20: Средняя длина `run()` — 40–120 строк, максимум ~200
**Rule:** Если `run()` переваливает за 200 строк — декомпозировать на sub-handler'ы. Верхняя граница допустимого — 213 строк (`activate-account.handler.ts`).
**Anti-pattern:** 300+ строк в одном handler'е.

---

## 4. Параметры и типы

### CV-21: Params handler'а — объектный тип `<Name>Params`
**Rule:** Параметры `run()` объявляются как `type <HandlerName>Params = { ... }` рядом с handler'ом в том же файле. Позиционные параметры не используются, кроме тривиальных handler'ов (единственный `id`/`email`/`data`).
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:18-22`
**Second example:** `src/modules/encryption/use-case/envelope-encrypt/envelope-encrypt.handler.ts:11-14`
**Tolerated exception:** `CreateUserHandler.run(data: CreateUserData)` — когда параметр тривиален и уже имеет domain-тип.
**Anti-pattern:** `run(ip: string, email: string, password: string)`.

### CV-22: `type` вместо `interface` для Params/Result
**Rule:** `type <Name>Params = { ... }`, `type <Name>Result = { ... }`. `interface` используется только для контрактов с методами (например, `UseCaseHandler`).
**Example:** все handlers используют `type`.
**Anti-pattern:** `interface SignInParams { ... }`.
**Why:** единообразие, type поддерживает union'ы, intersection'ы, conditional types.

### CV-23: Опциональные поля через `?:`, не `= default`
**Rule:** `aad?: FlatAAD` в типах, не `aad: FlatAAD = {}`. Default значения — **только** в деструктуризации уровня кода.
**Example:** `src/modules/encryption/infrastructure/encryption/encryption.service.ts:111` — `aad?: FlatAAD`
**Anti-pattern:** попытка задать default в `type`.

### CV-24: Деструктуризация — в теле метода, не в сигнатуре
**Rule:** Параметр поступает как `params: XxxParams`, деструктурируется на отдельной строке внутри метода, если нужна.
**Example:** `src/infrastructure/rabbitmq/outbox/outbox.service.ts:22` — `const { type, routingKey = '', exchange = '', data } = params;`
**Anti-pattern:** `async run({ type, routingKey = '', ... }: Params)` прямо в сигнатуре.

### CV-25: Defaults — только в деструктуризации
**Rule:** Если поле имеет default-значение при отсутствии — оно появляется в деструктуризации: `const { routingKey = '', exchange = '' } = params;`. Не через `??` ниже по коду.
**Example:** `outbox.service.ts:22`
**Anti-pattern:** `const routingKey = params.routingKey ?? '';`

### CV-26: Naming параметров — полные слова + известные сокращения
**Rule:** `ip`, `id`, `email`, `url`, `jwt`, `dto`, `dek`, `kek`, `aad`, `iv`, `kms` — ок. Остальное — полное слово: `password`, не `passwd`; `userId`, не `uid`; `partner`, не `p`.
**Example:** `SignInParams = { ip; email; password }`.
**Anti-pattern:** `u`, `pwd`, `e`, `d`.

### CV-27: Generic-параметры — `T`, `E` для простых, смысловые — для сложных
**Rule:** В библиотечном коде — `T`/`E` (`Result<T, E>`, `UseCaseHandler<UseCaseParams, UseCaseResult>`). В публичных методах — смысловые (`UseCaseParams`, `UseCaseResult`).
**Example:** `src/lib/clean/use-case.ts:1-3` — `UseCaseHandler<UseCaseParams, UseCaseResult>`; `src/lib/typeorm/run-in-tx-result.ts:8-14` — `<T = unknown, E extends string = string>`.
**Anti-pattern:** `interface UseCaseHandler<T1, T2>`.

---

## 5. Классы и DI

### CV-28: `@Injectable()` голый + `private readonly` через конструктор
**Rule:** Класс помечен `@Injectable()` без параметров. Все зависимости — `constructor(private readonly x: X, private readonly y: Y) {}`.
**Example:** `src/modules/user/use-case/create-user/create-user.handler.ts:8-13`
**Anti-pattern:** публичные поля, ручная инициализация `this.x = x`, `@Injectable({ scope: Scope.REQUEST })` без причины.

### CV-29: Порядок зависимостей в конструкторе — слой за слоем
**Rule:** Infrastructure-сервисы (`HashService`, `RedlockService`, `RateLimitService`) → repositories → external-сервисы → sub-handlers. Порядок неслучайный.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:34-43` — именно этот порядок.
**Anti-pattern:** random order, алфавитная сортировка.

### CV-30: `Logger` инициализируется в конструкторе как `private readonly`
**Rule:** `private readonly logger: Logger;` объявлен, в конструкторе — `this.logger = new Logger(ClassName.name);`.
**Example:** `src/infrastructure/redis/redlock/redlock.service.ts:18-21`
**Second example:** `src/infrastructure/rabbitmq/outbox/outbox-synchronization/outbox-synchronization.scheduler.ts:11-19`
**Anti-pattern:** `@Inject(Logger)`, global logger, инжектирование `LoggerService`.

### CV-31: `static readonly` константы внутри класса для доменных величин сервиса
**Rule:** Если класс имеет специфичные константы (длины буферов, алгоритмы), они живут как `private static readonly` в начале класса, имена — `SCREAMING_SNAKE_CASE`.
**Example:** `src/modules/encryption/infrastructure/encryption/encryption.service.ts:78-81` — `static readonly ALG`, `IV_LEN`, `TAG_LEN`, `KEY_LEN`.
**Anti-pattern:** magic numbers в теле методов, module-level `const` для классовых констант.

---

## 6. Data structures и коллекции

### CV-32: Массивы — `T[]`, не `Array<T>`
**Rule:** Синтаксис массива — `T[]`. `Array<T>` допускается только когда inline-объявление с anonymous type (`Array<{ id: string; ... }>`), чтобы не множить скобки.
**Example:** `src/infrastructure/redis/redlock/redlock.service.ts:24` — `resources: string[]`
**Tolerated:** `src/modules/encryption/use-case/envelope-encrypt-many/envelope-encrypt-many.handler.ts` — `items: Array<{...}>` для читаемости.
**Anti-pattern:** `Array<string>` везде.

### CV-33: `Record<string, T>` для ключ-значение структур
**Rule:** Для простых map-подобных структур используется `Record<K, V>`, не `Map`.
**Example:** `src/modules/encryption/infrastructure/encryption/encryption.service.ts:26` — `type FlatAAD = Record<string, string | number | boolean | null>`
**Anti-pattern:** `new Map()` для простых lookup'ов.
**Why:** сериализуется в JSON напрямую, проще типизируется.

### CV-34: Обход массивов — `.map()` для трансформации, `for`-loop для side-effects
**Rule:** Если надо получить новый массив из старого — `arr.map(...)`. Если надо побочный эффект (накопление в несколько массивов, как в outbox scheduler) — явный loop через `.map(async)` + `Promise.all`.
**Example:** `src/infrastructure/rabbitmq/outbox/outbox-synchronization/outbox-synchronization.scheduler.ts:38-57` — цикл через `.map(async msg => { ... })` + `Promise.all` для параллельной обработки с накоплением `passMsgIds`/`failMsgIds`.
**Anti-pattern:** `.reduce()` для построения объектов с side-effect'ами, `forEach` в async-контексте.

### CV-35: `.reduce()` редок, только для aggregations
**Rule:** `.reduce()` не используется для построения массивов/объектов. Только если реально нужна агрегация (sum, count, min).
**Anti-pattern:** `items.reduce((acc, x) => ({ ...acc, [x.id]: x }), {})`.

### CV-36: Нет `for...in`; `for...of` только для `Object.entries`
**Rule:** `for...in` не встречается. `for...of` используется для итерации по `Object.entries(obj)` (например, нормализация AAD).
**Example:** `src/modules/encryption/infrastructure/encryption/encryption.service.ts:272-284` — `for (const [key, value] of entries)`.
**Anti-pattern:** `for (const key in obj)`.

---

## 7. Строки и ключи

### CV-37: Template literals для динамических строк
**Rule:** Любая строка с подстановкой — `` `...${x}...` ``. Конкатенация через `+` не используется.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:51`
**Anti-pattern:** `'rate-limit:' + email + ':' + ip`.

### CV-38: Redis/lock keys — `namespace:operation:id` через двоеточие
**Rule:** Ключи Redis и redlock строятся по формату `<namespace>:<operation>:<identifier>`, сегменты через `:`.
**Examples:**
- `` `rate-limit:sign-in:${email}:${ip}` `` — `sign-in.handler.ts:51`
- `` `atomic:sign-in:${email}` `` — `sign-in.handler.ts:61`
- `` `lock:outbox` `` — `outbox-synchronization.scheduler.ts`
**Anti-pattern:** flat keys (`signInRateLimit_${email}`), разные разделители.

### CV-39: Одинарные кавычки везде, double — только в JSX (которого тут нет)
**Rule:** `'string'`, не `"string"`. Settings Prettier `singleQuote: true`.
**Anti-pattern:** double quotes.

---

## 8. Декомпозиция

### CV-40: Sub-handler для каждой стратегии/ветки сложного use-case
**Rule:** Если внутри use-case есть branching по стратегии (TOTP vs EMAIL, refresh vs pending challenge), каждая стратегия — отдельный handler в поддиректории `strategies/`.
**Example:** `src/modules/auth/use-case/presentation/sign-in/strategies/sign-in-email/`, `.../sign-in-totp/`
**Second example:** `src/modules/auth/use-case/presentation/confirm-otp/strategies/confirm-otp-email/`, `.../confirm-otp-totp/`
**Anti-pattern:** `private async signInViaEmail() { ... }` + `private async signInViaTotp() { ... }` в одном классе.

### CV-41: Порог выделения sub-handler'а — ~80–120 строк branch-логики
**Rule:** Когда одна ветка switch/if займёт больше 80–120 строк, она выносится в sub-handler даже если это единственная ветка.
**Example:** `sign-in-email.handler.ts` — 118 строк, выделен из SignInHandler.
**Anti-pattern:** 300+-строчный handler с большими if-блоками.

### CV-42: `external-service` как публичный контракт модуля
**Rule:** Если handlers из модуля `A` нужны модулю `B`, они экспортируются через `modules/A/external/<A>-external.service.ts`. Модуль `B` инжектит external-service, не handler.
**Example:** `src/modules/user/external/user-external.service.ts` — фасад над `CreateUserHandler`, `FindUserByIdHandler`, `FindUserByEmailHandler`.
**Second example:** `src/modules/encryption/external/external-encryption.service.ts`.
**Anti-pattern:** прямой импорт handler'а из соседнего модуля.

### CV-43: Presentation-service между controller'ом и handler'ом
**Rule:** Controller зовёт presentation-service, presentation-service зовёт handler и маппит `Result.error` → `HttpException`. Controller с handler'ом не контактирует напрямую.
**Example:** `src/modules/auth/presentation/auth-presentation.service.ts:62-78` — `signIn` метод.
**Anti-pattern:** controller инжектит handler напрямую.

---

## 9. Ритм и пустые строки

### CV-44: Группы импортов разделены пустой строкой
**Rule:** Порядок групп: 1) external packages (`@nestjs/*`, `neverthrow`, `rxjs`) → 2) `src/lib` или `src/infrastructure` absolute → 3) cross-module relative (`../../user/...`) → 4) local relative (`./types`, `./errors`). Между группами — пустая строка.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:1-16`
**Anti-pattern:** все импорты одним блоком без разделения; алфавитная сортировка по файлам.

### CV-45: Пустая строка **не** ставится после `return err(...)` перед следующим statement
**Rule:** `if (result.isErr()) { return err(result.error); }` и следующий `const x = result.value` — без пустой строки между ними.
**Example:** `src/modules/user/use-case/create-user/create-user.handler.ts:17-22`
**Anti-pattern:** визуальное разделение одного логического потока.

### CV-46: Пустая строка — только перед **новой фазой** в сложном handler'е
**Rule:** В handler'е с 100+ строками допускается 1–2 пустые строки между крупными фазами: после получения всех нужных данных → перед запуском бизнес-решения, перед блоком publish/commit. Больше одной подряд — никогда.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts` — между rate-limit блоком и redlock блоком пустой строки нет, фазы плотно прилегают.
**Anti-pattern:** пустая строка между каждыми двумя statement'ами.

### CV-47: Пустая строка после закрывающей `}` блока redlock/transaction wrapper перед финальной обработкой
**Rule:** После `redlockService.using(...)` или `runInTransactionResult(...)` — одна пустая строка, затем обработка внешнего результата.
**Example:** `sign-in.handler.ts:144-146` — пустая строка перед `if (atomicResult.isErr())`.

---

## 10. Enum'ы и константы

### CV-48: Только string enums, значения — `snake_case` lowercase
**Rule:** `enum X { FOO = 'foo', BAR_BAZ = 'bar_baz' }`. Ключи — SCREAMING_SNAKE_CASE, значения — lowercase snake_case.
**Example:** `src/modules/intent/domain/intent.ts:1-7` — `IntentState { COLLECTING_COMPLIANCE = 'collecting_compliance', ... }`
**Second example:** `src/modules/auth/domain/auth-challenge.ts` — `AuthChallengeType { TOTP = 'totp', EMAIL = 'email' }`
**Anti-pattern:** numeric enums, PascalCase в значениях.

### CV-49: Константы домена — в `domain/*.ts` или `domain/*.config.ts`
**Rule:** Module-level константы (TTL, max attempts, cooldown periods) живут в `domain/<name>.config.ts` или в соответствующем `domain/*.ts`. Не в handler'ах.
**Example:** `src/modules/auth/domain/auth-activation.config.ts`, `src/modules/auth/domain/risk-policy.config.ts`
**Anti-pattern:** `const TTL = 5 * 60 * 1000;` внутри handler'а.

### CV-50: Naming constants — `SCREAMING_SNAKE_CASE`
**Rule:** `AUTH_CHALLENGE_TTL`, `MAX_LOGIN_ATTEMPTS`, `IV_LEN`.
**Anti-pattern:** `authChallengeTtl`.

---

## 11. Result типизация

### CV-51: Сигнатура — всегда именованный error type
**Rule:** `Promise<Result<T, NamedErrorCode>>`. Никогда `Result<T, string>`.
**Example:** все handlers и repositories.
**Anti-pattern:** `Result<T, string>` (встречается в `OutboxService` — tracked в baseline как нарушение R02).

### CV-52: Success без данных — `Result<void, E>`
**Rule:** Если успех не несёт payload — `Result<void, E>`. В теле — `return ok()` без аргумента.
**Example:** `src/infrastructure/rabbitmq/outbox/outbox.service.ts:36`
**Anti-pattern:** `Result<null, E>`, `Result<undefined, E>`, `return ok(undefined)`.

### CV-53: Union error types для композиции
**Rule:** Если метод может вернуть ошибки нескольких источников — union: `Result<T, E1 | E2>`.
**Example:** `src/infrastructure/redis/redlock/redlock.service.ts:27` — `Result<T, E | RedisRedlockUsingError>`.
**Anti-pattern:** один общий `string` код для всего.

---

## 12. Комментарии

### CV-54: Комментарии отсутствуют в handlers и repositories
**Rule:** Handler и repository **не содержат** inline-комментариев. Код самодокументируется через naming и типы.
**Anti-pattern:** `// check password`, `// find user`, `// return error`.

### CV-55: JSDoc только в библиотечном/security-чувствительном коде
**Rule:** JSDoc-блоки (`/** ... */` с `@param`, `@returns`) пишутся только в `src/lib/` и security-сервисах (encryption), где контракт критичен и нужен для внешних потребителей.
**Example:** `src/modules/encryption/infrastructure/encryption/encryption.service.ts:6-107` — большой JSDoc-блок описывает `FlatAAD`, `EncryptionService`, `encrypt`.
**Anti-pattern:** JSDoc на handler'ах / repositories / controllers.

### CV-56: `/* sql */` тэг перед template literal в миграциях
**Rule:** `queryRunner.query(/* sql */ \`...\`)` — магический комментарий активирует подсветку SQL-синтаксиса в IDE.
**Example:** `src/infrastructure/db/migrations/1775751093754-partner-onboarding.ts:7`
**Anti-pattern:** raw SQL без `/* sql */` в template literal.

---

## 13. Import'ы

### CV-57: Relative imports внутри модуля, absolute через `src/` с глубины 4+
**Rule:** Внутри модуля — относительные пути (`./`, `../`, `../../`). Если путь уходит глубже 4 уровней — переход на абсолютный `src/...`.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:11` — `import { RedlockService } from 'src/infrastructure/redis/redlock/redlock.service';` — 5 уровней вверх, абсолютный.
**Anti-pattern:** `../../../../../infrastructure/redis/...` — нечитаемо.

### CV-58: Named imports, никогда default
**Rule:** `import { Foo } from '...';`. Default imports не используются.
**Anti-pattern:** `import Foo from '...'`.

### CV-59: Без `import type { ... }` на простые алиасы
**Rule:** Type aliases импортируются обычным `import { ... }`, без `import type`. TS strict'ом обрабатывает правильно.
**Example:** `import { CreateUserErrorCode } from './create-user.errors';` — это алиас, импортируется без `type`.
**Anti-pattern:** `import type { CreateUserErrorCode }`.

---

## 14. Redis / DB / RabbitMQ идиомы

### CV-60: Redlock callback — `async (): Promise<Result<T, E>> =>`, никогда не throw
**Rule:** Коллбек внутри `redlockService.using(keys, duration, async (): Promise<Result<T, E>> => { ... })` обязан быть `async`, аннотирован типом возврата и возвращать `Result`. Throw внутри — запрещено.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:60-144`
**Anti-pattern:** throw внутри callback'а, отсутствие аннотации возврата.

### CV-61: TypeORM — `insert` для создания, `findOne({ where })` для чтения
**Rule:** Создание записи — `this.repository.insert(data)`. Чтение по условию — `this.repository.findOne({ where: { field: value } })`. `findOneBy` не используется для консистентности.
**Example:** `src/modules/user/infrastructure/repositories/user/user.repository.ts:24, 48`
**Anti-pattern:** `repository.save()` для новой записи, `findOneBy()` вместо `findOne({ where })`.

### CV-62: Advisory lock — sha256 → `readBigInt64BE` → `pg_try_advisory_xact_lock($1)`
**Rule:** Ключ advisory lock — строка → sha256 → BigInt64. Запрос — `SELECT pg_try_advisory_xact_lock($1)` с параметром.
**Example:** `src/infrastructure/db/advisory-lock/advisory-lock.service.ts:15-29`
**Anti-pattern:** прямое использование ключа как числа, raw string concatenation в SQL.

### CV-63: RabbitMQ publish — через `RabbitProxy.emit` с `lastValueFrom`
**Rule:** Публикация в Rabbit — `await lastValueFrom(this.rabbitProxy.emit(routingKey, { exchange, confirmation, data }))` внутри `fromAsyncThrowable`.
**Example:** `src/infrastructure/rabbitmq/outbox/outbox.service.ts:37-48`
**Anti-pattern:** прямая работа с amqplib, без `lastValueFrom`.

---

---

## 15. Micro-rhythm внутри методов

Детализация **ритмики пустых строк и группировки statement'ов** внутри handler'ов и services — то, что делает код похожим по ощущению, а не только по форме.

### CV-64: Блок guard clause'ов — **без пустых строк** между проверками
**Rule:** Несколько подряд идущих `if (result.isErr()) return err(...)` (обычно 3–5 штук) идут плотно, без пустых строк между ними. Это одна фаза — сбор данных с ранними возвратами.
**Example:** `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:64-91` — пять последовательных проверок `findUserResult`, `findAuthUserProfileResult`, `verifyHashResult`, `findPendingAuthChallengeResult` идут плотно.
**Anti-pattern:** пустые строки между guard clause'ами — разбивает единый поток на псевдо-фазы.

### CV-65: Unpacking + первая проверка нового значения — **плотно**
**Rule:** `const user = findUserResult.value;` и следующий `if (authUserProfile.status !== ACTIVATED) return err(...)` — без пустой строки между ними. Unpacking и проверка — логическое целое.
**Example:** `sign-in.handler.ts:74-88` — `const user = ... const findAuthUserProfileResult = ... if (...) return err(...); const authUserProfile = ... if (authUserProfile.status !== ...) return err(...);` — всё плотно, без визуальных разделителей.
**Anti-pattern:** пустая строка между `const x = result.value` и `if (x.somethingWrong)`.

### CV-66: **Пустая строка перед** входом в `redlockService.using` / `runInTransactionResult`
**Rule:** Перед вызовом wrapper'а, открывающего критическую секцию — одна пустая строка. Это визуально отделяет pre-setup (rate-limit, валидация параметров, IP extraction) от входа в lock/tx.
**Example:** `sign-in.handler.ts:58-60` — `if (usingTokenBucketResult.isErr()) return err(...);` → **пустая строка** → `const atomicResult = await this.redlockService.using(...)`
**Anti-pattern:** плотное склеивание — `if (rateLimit.isErr()) return err(); const atomicResult = redlock.using(...)`.

### CV-67: **Пустая строка после** закрывающей `}),` wrapper'а перед обработкой результата
**Rule:** После `});` закрывающего `redlockService.using` или `runInTransactionResult` — одна пустая строка, затем `if (atomicResult.isErr())`.
**Example:** `sign-in.handler.ts:144-146`:
```ts
    );

    if (atomicResult.isErr()) {
```
**Anti-pattern:** склеивание закрытия wrapper'а с обработкой — `); if (atomicResult.isErr())` на соседних строках.
**Why:** wrapper — крупный блок (часто 50+ строк); post-processing — отдельная фаза и заслуживает визуального отделения.

### CV-68: **Пустая строка после деструктуризации `const { ... } = params`**
**Rule:** Если в начале метода деструктурируется `params` — после строки деструктуризации одна пустая строка, затем основная логика.
**Example:** `src/infrastructure/rabbitmq/outbox/outbox.service.ts:22-23`:
```ts
    const { type, routingKey = '', exchange = '', data } = params;
    const createResult = await this.outboxMessageRepository.create({...});
```
— в этом примере плотно, но когда метод длинный, автор оставляет пустую строку.
**Anti-pattern:** никогда — пустая строка здесь **опциональна**, и в коротких методах её нет.

### CV-69: **Нет пустых строк вокруг `const x = result.value`**
**Rule:** Unpacking — это микро-шаг, не заслуживающий визуального веса. Он идёт плотно с тем, что вокруг.
**Example:** повсюду в `sign-in.handler.ts` — `const user = findUserResult.value` стоит сразу после `if (findUserResult.isErr())` без пустой строки.
**Anti-pattern:** визуальное выделение каждого unpacking'а пустыми строками.

### CV-70: **Пустая строка** между крупными фазами use-case'а
**Rule:** Если `run()` имеет несколько чётко различимых фаз — validate → lock → load data → business decision → write → return — между фазами **по одной** пустой строке. Не больше.
**Example:** `activate-account.handler.ts` внутри `runInTransactionResult` — между блоком проверок activation → инкремента attempts → генерации токенов → записи есть пустые строки (одна между каждой парой фаз).
**Anti-pattern:** две пустые строки подряд; либо плотный monolith без визуального ритма.

### CV-71: **Нет пустой строки после `return ok(...)` / `return err(...)` перед `}`**
**Rule:** Метод не заканчивается пустой строкой перед закрывающей скобкой.
**Example:** `sign-in.handler.ts:158-160` — `return ok(atomicResult.value); }`
**Anti-pattern:** `return ok(...); \n }`.

### CV-72: **Нет пустых строк внутри switch case'ов**
**Rule:** Каждый `case` — одна строка или два statement'а подряд. Внутри case пустых строк нет.
**Example:** `sign-in.handler.ts:128-142` — все case'ы плотные, без пустых строк внутри.
**Anti-pattern:** разряженный switch с пустыми строками между case'ами или внутри них.

### CV-73: Rate-limit / pre-validation — **первая фаза** в `run()`, без пустой строки до этого
**Rule:** Если handler использует `RateLimitService` или pre-validation (типа `extractIp`), это идёт первым statement'ом в `run()`, без пустой строки от `async run(...)`.
**Example:** `sign-in.handler.ts:49-58` — `const usingTokenBucketResult = await this.rateLimitService.usingTokenBucketOrInterrupt(...)` — сразу после `async run`, без визуальной паузы.
**Anti-pattern:** пустая строка перед rate-limit проверкой.

---

## 16. Naming промежуточных const и callback'ов (расширение CV-07/CV-08)

Детализация под конкретные контексты.

### CV-74: Внутри `redlockService.using` callback — тот же паттерн `<verb><Noun>Result`
**Rule:** Именование не меняется при входе внутрь callback'а. Все Result'ы именуются как снаружи: `findUserResult`, `verifyHashResult`.
**Example:** `sign-in.handler.ts:60-144` — весь callback заполнен `<verb><Noun>Result` без отклонений.
**Anti-pattern:** сокращённые имена внутри callback'а («и так всё локально»).

### CV-75: Внутри `.map(async msg => ...)` — распаковка Result сразу в callback'е
**Rule:** Callback `.map()` выполняет операцию, проверяет `isErr`, push'ит в соответствующий массив. Не возвращает Result из callback'а для последующей обработки.
**Example:** `src/infrastructure/rabbitmq/outbox/outbox-synchronization/outbox-synchronization.scheduler.ts:38-56`:
```ts
const promises = getMessagesResult.value.map(async (msg) => {
  const emitResult = await fromAsyncThrowable(async () => ...)();
  if (emitResult.isErr()) {
    failMsgIds.push(msg.id);
  } else {
    passMsgIds.push(msg.id);
  }
});
```
**Anti-pattern:** `.map()` возвращает Result, а обработка в следующем шаге через `Promise.all + .filter`.

### CV-76: Накопительные массивы — явные имена `passXxx` / `failXxx` / `<role>Ids`
**Rule:** Когда в `.map(async ...)` накапливаются элементы в несколько массивов, имена массивов — специфичные: `passMsgIds`, `failMsgIds` (не `success`/`errors`, не `a`/`b`).
**Example:** `outbox-synchronization.scheduler.ts:35-36`
**Anti-pattern:** `const passed`, `const failed`, `const ids`.

### CV-77: Redlock `using` callback типизируется явно через `: Promise<Result<T, E>>`
**Rule:** Anonymous async callback имеет явную аннотацию возвращаемого типа:
```ts
async (): Promise<Result<SignInResult, SignInErrorCode>> => { ... }
```
**Example:** `sign-in.handler.ts:63`
**Anti-pattern:** `async () => { ... }` без аннотации — TS выведет, но для читаемости и дисциплины аннотация обязательна.

---

## 17. Комментарии в нетривиальных местах

Детализация CV-54/55.

### CV-78: Бизнес-код (handlers, repositories, presentation) — **ноль** inline-комментариев
**Rule:** В `src/modules/<name>/use-case/`, `.../infrastructure/repositories/`, `.../presentation/` — **нет** inline `//` комментариев. Код самодокументируется.
**Verification:** handler'ы `sign-in`, `activate-account`, `create-user`, repositories `user`, `auth-challenge` — ни одного `//` в бизнес-логике.
**Anti-pattern:** `// check if user exists`, `// verify password hash`, `// return error if...`.

### CV-79: `src/lib/` — допускает однострочные `//` комментарии для алгоритмических пояснений
**Rule:** В `src/lib/` комментарии появляются для пояснения не-очевидных алгоритмов, особенно связанных с constraints.
**Example:** `src/lib/short-code/generate-short-code.ts:3-11` — комментарии вроде `// Alphabet for readable codes`, `// Note: always enforce UNIQUE constraint...`
**Why:** библиотечный код пере-используется и нуждается в пояснении инварианта, который невозможно вывести из имени функции.
**Anti-pattern:** комментарии «что делает следующая строка»; только **почему** и **при каких условиях**.

### CV-80: Security-чувствительный код — **JSDoc блок** с детализированным описанием
**Rule:** Классы типа `EncryptionService`, `KmsService` имеют большие JSDoc блоки в начале класса и на критичных методах. Описывают: что делает, как работает, какие инварианты, какие ограничения.
**Example:** `src/modules/encryption/infrastructure/encryption/encryption.service.ts:6-107` — JSDoc описывает `FlatAAD`, `EncryptionService`, метод `encrypt`.
**Anti-pattern:** однострочные `//` комментарии на security-коде; отсутствие JSDoc на публичных методах crypto/auth-сервисов.

### CV-81: Комментарии на **русском** допустимы для пояснения бизнес-терминов домена
**Rule:** Если комментарий поясняет термин KYB/compliance-домена (OFI, DFI, RFI, UBO) — он может быть на русском для точности. Идентификаторы кода остаются английскими.
**Tolerated example:** `// OFI выбирает DFI` в controllers/presentation
**Anti-pattern:** русские комментарии на технические вещи (`// Проверяем ошибку`).

### CV-82: `// TODO` и `// NOTE` — **только** с привязкой к тикету
**Rule:** Если в коде появляется `// TODO`, то с JIRA-ключом: `// TODO(PLEX-123): <описание>`. Голый `// TODO: fix later` — запрещён.
**Anti-pattern:** `// TODO: fix`, `// FIXME`, `// XXX` без контекста.

### CV-83: `/* sql */` magic comment перед template literal в миграциях
**Rule:** В файлах миграций `queryRunner.query(/* sql */ \`...\`)` — комментарий активирует SQL-подсветку в IDE.
**Example:** `src/infrastructure/db/migrations/1775751093754-partner-onboarding.ts:7`
**Why:** IDE-специфично, но дисциплинированно используется во всех миграциях.
**Anti-pattern:** raw template literal без `/* sql */`.

---

## 18. Redis / DB / infrastructure wrapper паттерны

Детализация CV-60/61 и др.

### CV-84: `*.utilities.ts` — файл с чистыми функциями и type guards рядом с repository
**Rule:** Если repository требует парсинга raw результата (особенно из custom query), парсинг выносится в соседний файл `<repo>.utilities.ts` — набор экспортируемых чистых функций и type guards.
**Example:** `src/modules/auth/infrastructure/repositories/auth-challenge/auth-challenge.utilities.ts` — экспортирует type guard `isAttemptsRow(value)`.
**Second example:** `auth-activation.utilities.ts` — аналогично.
**Anti-pattern:** парсинг raw-структур внутри методов repository'я; создание целого класса-парсера.

### CV-85: Type guards в `*.utilities.ts` — чистые функции с `: value is X`
**Rule:** Функции в utilities именуются `is<ShapeName>(value: unknown): value is ShapeName`, без побочных эффектов.
**Example:** `auth-challenge.utilities.ts:1-8`
**Anti-pattern:** `validateAttemptsRow(value)` возвращающее `boolean` — нет type narrowing.

### CV-86: Advisory lock — ключ через sha256 → `readBigInt64BE` → `pg_try_advisory_xact_lock($1)`
**Rule:** Канонический паттерн advisory lock: строковый ключ → sha256 → `readBigInt64BE()` → передача как параметр в `SELECT pg_try_advisory_xact_lock($1)`.
**Example:** `src/infrastructure/db/advisory-lock/advisory-lock.service.ts:15-29`
**Why:** PostgreSQL advisory lock принимает `int64`, не строку; sha256 обеспечивает равномерное распределение и отсутствие коллизий для разных namespace'ов.
**Anti-pattern:** преобразование строки в число через `parseInt`, хэш-функции слабее sha256.

### CV-87: Lua-скрипты Redis — `export const <NAME>_SCRIPT = \`...\`;` в отдельном `*.script.ts` файле
**Rule:** Lua-скрипты для rate-limit / atomic operations хранятся в `src/infrastructure/redis/**/lua/<name>.script.ts`, экспортируются как `const SCRIPT_NAME = \`lua code\``. Один файл = один скрипт.
**Example:** `src/infrastructure/redis/rate-limit/lua/token-bucket.script.ts:1-36` — весь файл это `export const TOKEN_BUCKET_SCRIPT`.
**Second example:** `src/infrastructure/redis/rate-limit/lua/timed-queue.script.ts`
**Why:** скрипт версионируется отдельно, изолирован от TS-логики, может быть протестирован независимо.
**Anti-pattern:** Lua-скрипт как template literal внутри service-метода.

### CV-88: Lua-скрипты загружаются **один раз** через `redis.script('LOAD', SCRIPT)` в конструкторе / `onModuleInit`
**Rule:** `RateLimitService` загружает скрипты при инициализации, кэширует SHA-хэши в `private readonly` полях (`timedQueueSHA`, `tokenBucketSHA`), использует `evalsha` вместо повторной загрузки.
**Example:** `src/infrastructure/redis/rate-limit/rate-limit.service.ts:18-43`
**Anti-pattern:** повторная загрузка скрипта на каждый вызов `usingTokenBucket`.

### CV-89: Rate-limit возвращает **структурированный** Result, не boolean
**Rule:** Вместо `Promise<Result<boolean, E>>` — возвращается информативный payload: `Result<{ allowed, tokens, untilRefill }, E>` или `Result<void, E>` с ошибкой `RATE_LIMIT_EXCEEDED`. Caller получает достаточно данных для принятия решения или ответа пользователю (например, `Retry-After` header).
**Example:** `rate-limit.service.ts:79-99`
**Anti-pattern:** `usingTokenBucket(key, ...): Promise<boolean>` — теряется информация о tokens/timing.

### CV-90: Redlock `duration` = ожидаемое время критической секции × 2
**Rule:** Параметр `duration` в `redlockService.using(keys, duration, routine)` — это верхняя граница: удвоенное expected время операции. Минимум 1000 ms.
**Examples:**
- `sign-in.handler.ts:62` — `5000 ms` (ожидаемое время ~2.5 сек: load user + verify hash + create challenge)
- `outbox-synchronization.scheduler.ts:24` — `10000 ms` (batch 50 сообщений, ожидаемое ~5 сек)
**Anti-pattern:** `duration = 60000` без обоснования; `duration = 500` для тяжёлой операции.

### CV-91: TypeORM — `insert(data)` для создания, `findOne({ where })` для чтения
**Rule:** Создание записи — `this.repository.insert(data)`. Чтение по условию — `this.repository.findOne({ where: { field: value } })`. `findOneBy` и `save` избегаются для консистентности.
**Example:** `src/modules/user/infrastructure/repositories/user/user.repository.ts:24, 48`
**Anti-pattern:** `repository.save()` для создания новой записи; `findOneBy()` вместо `findOne({ where })`.

### CV-92: Repository методы update/delete возвращают `Result<number, E>` (количество строк)
**Rule:** Для методов, которые модифицируют БД (update, delete, increment), возвращается `Result<number, E>` с числом затронутых строк. Caller может проверить, обновилось ли что-то.
**Example:** паттерн `incrementAttempt` в auth-repositories — возвращает количество обновлённых.
**Anti-pattern:** `Result<void, E>` — теряется информация о том, сработал ли update.

---

## Чек-лист voice при написании нового кода

Перед commit'ом пройди по этому списку вручную. Это не заменяет `/spec-check`, но даёт быструю проверку на «звучит ли как проект».

- [ ] Есть ли `else`? Если да — переделать в early return (CV-01)
- [ ] Все промежуточные Result'ы именованы `<verb><Noun>Result`? (CV-07)
- [ ] Распакованные значения — без суффикса `Result`? (CV-08)
- [ ] Error codes — `<OPERATION>_<REASON>`, в `.errors.ts` рядом? (CV-09, CV-10)
- [ ] Throwable обёрнут через `fromAsyncThrowable(async () => ...)()` ? (CV-13)
- [ ] Handler имеет `@Injectable()` + `private readonly` конструктор? (CV-28)
- [ ] Зависимости в конструкторе идут в порядке: infra → repo → external → sub-handler? (CV-29)
- [ ] Параметры handler'а — `type <Name>Params`, не позиционные? (CV-21, CV-22)
- [ ] Defaults — в деструктуризации, не через `??`? (CV-25)
- [ ] `async` даже если нет `await`? (CV-15)
- [ ] `.then()` не используется? (CV-16)
- [ ] Return type явный? (CV-18)
- [ ] `switch` имеет `default: return err(...)` ? (CV-02)
- [ ] Enum — string, значения `snake_case`? (CV-48)
- [ ] Нет inline-комментариев? (CV-54)
- [ ] Redis/lock keys — `namespace:operation:id`? (CV-38)
- [ ] Import'ы сгруппированы с пустыми строками? (CV-44)
- [ ] Private методы есть? Если да — подумать о sub-handler'е (CV-19)
- [ ] Длина `run()` до 200 строк? (CV-20)
- [ ] Redlock callback возвращает Result и async? (CV-60)
- [ ] Redlock callback имеет явную аннотацию `: Promise<Result<T, E>>`? (CV-77)
- [ ] Redlock `duration` ≈ expected × 2? (CV-90)
- [ ] Guard clause'ы идут плотно, без пустых строк? (CV-64)
- [ ] Пустая строка **перед** `runInTransactionResult` / `redlockService.using`? (CV-66)
- [ ] Пустая строка **после** закрытия wrapper'а перед post-processing? (CV-67)
- [ ] Unpacking + первая проверка — без пустой строки между? (CV-65)
- [ ] Нет inline `//` комментариев в бизнес-коде? (CV-78)
- [ ] Промежуточные массивы в `.map(async ...)` именуются специфично (`passXxx`/`failXxx`)? (CV-76)
- [ ] Lua-скрипты — в отдельном `*.script.ts`, не inline? (CV-87)
- [ ] `utilities.ts` содержит type guards, а не классы? (CV-85)

## Процедура генерации нового кода

1. Определи тип файла (handler / repository / service / controller).
2. Открой эталон из таблицы «Эталонные файлы» в начале этого документа.
3. **Скопируй структуру эталона** (импорты, порядок блоков, форма конструктора) буквально.
4. Переименуй / адаптируй под свою задачу.
5. Пройди по чек-листу выше.
6. Запусти `/spec-check <path>` — получи автоматическую проверку.
7. Если есть нарушения — исправь и повтори.

## Когда правила конфликтуют

Если два правила дают разный ответ для одного места — **побеждает эталон**. Открой эталонный файл того же типа и смотри, как сделано там. Если эталон тоже не даёт ответа — задай вопрос владельцу.

## Эволюция правил

Правила voice — **наблюдение за реальным кодом**, не догма. Если при рефакторинге кодобазы появляется новая устойчивая идиома — этот файл обновляется. Процедура:

1. Паттерн появляется как минимум в 3 независимых местах.
2. Добавляется правило в соответствующую категорию.
3. В baseline `.claude/reports/` — новый audit, чтобы увидеть, где новый паттерн ещё не применён.
4. Постепенно подтягиваем существующий код под правило.
