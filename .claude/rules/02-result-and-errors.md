# 02. Result и обработка ошибок

## Правило №1: никаких `throw` в бизнес-логике

Handlers, repositories, domain services, infrastructure-сервисы — **всегда возвращают `Result<T, E>`** из [neverthrow](https://github.com/supermacro/neverthrow). `throw` разрешён только:

- в presentation-слое (controller/presentation-service) — для конвертации `Result.error` в HTTP-исключение (`BadRequestException`, `InternalServerErrorException`, и т.д.);
- в `main.ts` при старте приложения (fail-fast по конфигу);
- внутри `fromThrowable` / `fromAsyncThrowable` колбэков, где исключение будет поймано и обёрнуто.

## Правило №2: error codes — структурированные string literal union'ы

Ошибки — это **union строковых литералов** в `SCREAMING_SNAKE_CASE`. Никаких error-классов, никаких enum'ов. Структура — **двухуровневый namespace** + reason.

### Канонический формат

```
<OPERATION>_<SUB-NAMESPACE>_<REASON>
```

Где:
- **`<OPERATION>`** — главная функция: `CREATE_USER`, `SIGN_IN`, `ENCRYPT`, `DECRYPT`, `ACTIVATE_ACCOUNT`, `REGISTER_PARTNER`, `KMS_GENERATE_ENCRYPTION_KEY`
- **`<SUB-NAMESPACE>`** — фаза, sub-операция или контекст внутри главной функции: `DATA`, `NORMALIZE`, `FIND_ACTIVATION`, `SET_ACTIVATED`, `FAIL_TX`, `FINALIZE_TX`. Опционален для простых операций.
- **`<REASON>`** — конкретная причина из approved-списка (см. ниже)

### Эталоны

**Двухуровневый namespace** — основной паттерн (50+ файлов):

```ts
// src/modules/encryption/infrastructure/encryption/encryption.errors.ts:1-13
export type EncryptErrorCode =
  | 'ENCRYPT_DATA_INVALID_KEY_LENGTH'    // OP=ENCRYPT, SUB=DATA, REASON=INVALID_KEY_LENGTH
  | 'ENCRYPT_DATA_EMPTY_DATA'
  | 'ENCRYPT_DATA_ERROR'                  // catch-all внутри sub-namespace DATA
  | 'ENCRYPT_NORMALIZE_AAD_ERROR';        // другая sub-операция: NORMALIZE

export type DecryptErrorCode =
  | 'DECRYPT_DATA_INVALID_KEY_LENGTH'
  | 'DECRYPT_DATA_INVALID_ENCRYPTED_PAYLOAD'
  | 'DECRYPT_DATA_INVALID_IV_LENGTH'
  | 'DECRYPT_DATA_INVALID_TAG_LENGTH'
  | 'DECRYPT_DATA_ERROR'
  | 'DECRYPT_NORMALIZE_AAD_ERROR';
```

```ts
// src/modules/auth/use-case/presentation/activate-account/activate-account.errors.ts
export type ActivateAccountErrorCode =
  | 'ACTIVATE_ACCOUNT_NOT_FOUND'
  | 'ACTIVATE_ACCOUNT_EXPIRED'
  | 'ACTIVATE_ACCOUNT_INVALID_PASSWORD'
  | 'ACTIVATE_ACCOUNT_LOCKED'
  | 'ACTIVATE_ACCOUNT_HASH_FAILED'
  | 'ACTIVATE_ACCOUNT_GENERATE_JWT_FAILED'
  | 'ACTIVATE_ACCOUNT_FIND_ACTIVATION_DB_ERROR'    // фаза: FIND_ACTIVATION
  | 'ACTIVATE_ACCOUNT_SET_ACTIVATED_DB_ERROR'      // фаза: SET_ACTIVATED
  | 'ACTIVATE_ACCOUNT_FAIL_TX_ERROR'               // фаза: FAIL_TX
  | 'ACTIVATE_ACCOUNT_FINALIZE_TX_ERROR'           // фаза: FINALIZE_TX
  | 'ACTIVATE_ACCOUNT_REDLOCK_ERROR';
```

**Одноуровневый** допустим для простых операций без фаз:

```ts
// src/modules/user/infrastructure/repositories/user/user.repository.errors.ts:1-5
export type UserRepositoryCreateErrorCode =
  | 'CREATE_USER_DATABASE_ERROR'
  | 'CREATE_USER_CONFLICT';
```

### Approved suffixes (`<REASON>`)

| Suffix | Семантика | Пример |
|---|---|---|
| `_INVALID_<WHAT>` | Невалидный вход или формат | `INVALID_KEY_LENGTH`, `INVALID_CREDENTIALS` |
| `_NOT_FOUND` | Ресурс отсутствует | `CHALLENGE_NOT_FOUND`, `USER_NOT_FOUND` |
| `_CONFLICT` | Уникальный constraint, дубликат | `CREATE_USER_CONFLICT` |
| `_LOCKED` | Заблокировано (rate limit, lock) | `SIGN_IN_LOCKED`, `ACCOUNT_LOCKED` |
| `_EXPIRED` | TTL истёк | `CHALLENGE_EXPIRED`, `ACTIVATION_EXPIRED` |
| `_RATE_LIMIT_EXCEEDED` | Лимит rate-limit'а | `SIGN_IN_RATE_LIMIT_EXCEEDED` |
| `_COOLDOWN_ACTIVE` | OTP cooldown | `SIGN_IN_COOLDOWN_ACTIVE` |
| `_FAILED` | Внешний вызов вернул ошибку | `HASH_FAILED`, `GENERATE_JWT_FAILED`, `SMTP_SEND_FAILED` |
| `_DB_ERROR` | Ошибка на уровне БД | `CREATE_DB_ERROR`, `FIND_USER_DATABASE_ERROR` |
| `_TX_ERROR` | Ошибка transactional context'а | `FAIL_TX_ERROR`, `FINALIZE_TX_ERROR` |
| `_TARGET_MISSING` | UPDATE не нашёл строку | `SET_ACTIVATED_TARGET_MISSING` |
| `_REDLOCK_ERROR` | Distributed lock сломался | `ACTIVATE_ACCOUNT_REDLOCK_ERROR` |
| `_ALREADY_EXISTS` | Конфликт на бизнес-уровне | `REGISTER_PARTNER_USER_ALREADY_EXISTS` |
| `_PROFILE_NOT_ACTIVATED` / state-проверки | Состояние сущности не подходит | `SIGN_IN_PROFILE_NOT_ACTIVATED` |
| `_NETWORK_ERROR` | Сетевая ошибка до внешнего сервиса (axios-error без `response`) | `EXTRACTOR_SUBMIT_NETWORK_ERROR` |
| `_TIMEOUT` | Истёк таймаут HTTP-запроса (`ECONNABORTED`/`ETIMEDOUT`) | `EXTRACTOR_SUBMIT_TIMEOUT` |
| `_TRANSPORT_ERROR` | Throwable из HTTP-обёртки, не являющийся axios-error'ом (неожиданный throwable из SDK / клиентской библиотеки) | `EXTRACTOR_SUBMIT_TRANSPORT_ERROR` |
| `_RATE_LIMIT_INFRA_ERROR` | Локальный rate-limiter (Redis token bucket / timed queue) недоступен — ошибка инфры, **не** превышение лимита | `EXTRACTOR_SUBMIT_RATE_LIMIT_INFRA_ERROR` |
| `_ERROR` | **catch-all внутри namespace'а** (см. ниже) | `ENCRYPT_DATA_ERROR` |
| `_INTERNAL_ERROR` | Не классифицируется, последний resort | `SIGN_IN_INTERNAL_ERROR` |

### Правило `_ERROR` catch-all

Суффикс `_ERROR` **разрешён**, но только при двух условиях:

1. **Namespace задан** — `_ERROR` идёт после двухуровневого префикса, например `ENCRYPT_DATA_ERROR`, `DECRYPT_NORMALIZE_AAD_ERROR`. Не бывает голого `ERROR` или `OPERATION_ERROR` на верхнем уровне.
2. **Перечислены специфичные коды до него** — `_ERROR` идёт **последним** в union'е после всех конкретных причин (`INVALID_*`, `EMPTY_*`, `NOT_FOUND` и т.п.), как fallback для классификации, которая дошла до уровня sub-op, но дальше не углубляется.

```ts
// ✅ правильно
export type EncryptErrorCode =
  | 'ENCRYPT_DATA_INVALID_KEY_LENGTH'
  | 'ENCRYPT_DATA_EMPTY_DATA'
  | 'ENCRYPT_DATA_ERROR';        // catch-all для namespace ENCRYPT_DATA

// ❌ неправильно
export type EncryptErrorCode =
  | 'ENCRYPT_ERROR'              // catch-all без namespace
  | 'ERROR'                      // голый
  | 'UNKNOWN_ERROR';             // ничего не сообщает
```

### Правило `_INTERNAL_ERROR`

Зарезервирован для случаев, когда ошибку **невозможно** классифицировать как DB/validation/business-rule. Используется крайне редко (~2 места во всей кодбазе: `SIGN_IN_INTERNAL_ERROR`, `REGISTER_PARTNER_INTERNAL_ERROR`). Не используется как fallback для «лень дописывать остальные коды».

### Что запрещено

- `'ERROR'`, `'FAILED'`, `'UNKNOWN'`, `'UNKNOWN_ERROR'` — голые, без namespace'а
- `'DB_ERROR'`, `'TX_ERROR'` — без префикса операции
- camelCase или kebab-case
- Один union на весь модуль (например, `AuthErrorCode` со всеми 50 кодами)
- Разные семантики под одним кодом (например, `SIGN_IN_FAILED` для «неверный пароль» **и** «БД упала»)

## Правило №2-bis: один error-code тип на метод/operation

Если repository имеет **несколько методов** — каждый метод имеет **свой** type, не один общий на весь repository.

Эталон — `src/modules/auth/infrastructure/repositories/auth-challenge/auth-challenge.repository.errors.ts`:

```ts
export type AuthChallengeRepositoryCreateErrorCode =
  | 'CREATE_AUTH_CHALLENGE_DB_ERROR';

export type AuthChallengeRepositoryFindOnePendingErrorCode =
  | 'FIND_ONE_PENDING_AUTH_CHALLENGE_DB_ERROR'
  | 'FIND_ONE_PENDING_AUTH_CHALLENGE_INVALID_ROW_SHAPE';

export type AuthChallengeRepositorySetRejectedExpiredErrorCode =
  | 'SET_REJECTED_EXPIRED_AUTH_CHALLENGE_DB_ERROR'
  | 'SET_REJECTED_EXPIRED_AUTH_CHALLENGE_TARGET_MISSING';

export type AuthChallengeRepositoryIncrementAttemptErrorCode =
  | 'INCREMENT_AUTH_CHALLENGE_ATTEMPT_DB_ERROR'
  | 'INCREMENT_AUTH_CHALLENGE_ATTEMPT_TARGET_MISSING'
  | 'INCREMENT_AUTH_CHALLENGE_ATTEMPT_INVALID_ROW_SHAPE';
```

Правила:
- Имя типа — `<RepositoryName><MethodName>ErrorCode`
- В коды каждого метода входит как минимум `<METHOD>_DB_ERROR` (для технических ошибок)
- Если метод делает UPDATE по PK — добавляется `<METHOD>_TARGET_MISSING` (когда update не нашёл строку)
- Если метод парсит raw query result — добавляется `<METHOD>_INVALID_ROW_SHAPE`

Handler, использующий этот repository, либо проксирует ошибки через type alias, либо собирает их в union:

```ts
// activate-account.errors.ts
export type ActivateAccountErrorCode =
  | AuthActivationRepositoryFindByIdErrorCode
  | AuthActivationRepositorySetActivatedErrorCode
  | 'ACTIVATE_ACCOUNT_NOT_FOUND'
  | 'ACTIVATE_ACCOUNT_EXPIRED'
  | ...;
```

## Правило №3: `.errors.ts` рядом с кодом, который их производит

Для каждого handler'а — `*.handler.errors.ts`. Для каждого repository — `*.repository.errors.ts`. Если handler только проксирует ошибку репозитория — делай type alias, как `src/modules/user/use-case/create-user/create-user.errors.ts:1-3`:

```ts
import { UserRepositoryCreateErrorCode } from '../../infrastructure/repositories/user/user.repository.errors';
export type CreateUserErrorCode = UserRepositoryCreateErrorCode;
```

## Правило №4: композиция Result'ов

Эталон — `src/modules/user/use-case/create-user/create-user.handler.ts:15-22`:

```ts
async run(data: CreateUserData): Promise<Result<User, CreateUserErrorCode>> {
  const createResult = await this.userRepository.create(data);
  if (createResult.isErr()) {
    return err(createResult.error);
  }
  return ok(createResult.value);
}
```

- После каждого `await` — `if (result.isErr()) return err(result.error)`.
- Ранний возврат, плоский код. Никаких `try/catch` вокруг этого.
- Не использовать `.andThen()` / `.map()` если это делает код менее читаемым. Явное `if` лучше.

## Правило №5: оборачивание throwable-операций

Любой код, который может выбросить исключение (TypeORM, crypto, JSON.parse, внешние SDK), оборачивается в `fromThrowable` / `fromAsyncThrowable`:

Эталон — `src/modules/user/infrastructure/repositories/user/user.repository.ts:23-32`:

```ts
const insertResult = await fromAsyncThrowable(async () =>
  this.repository.insert(data),
)();
if (insertResult.isErr()) {
  if (isUniqueQueryError(insertResult.error)) return err('CREATE_USER_CONFLICT');
  return err('CREATE_USER_DATABASE_ERROR');
}
```

- Анализ исключения делается через **type guards** (`isUniqueQueryError`, `isRedisConnectionError` и т.п.), а не `instanceof`.
- Guards живут рядом с ошибками: `src/lib/typeorm/is-unique-error.ts`, `src/infrastructure/redis/redlock/redlock.errors.ts`.

## Правило №6: конвертация в HTTP происходит в presentation-service

См. **R08 → секция «Маппинг error codes на HTTP»** — там полная таблица suffix → status, response shape и план миграции на global ExceptionFilter.

Коротко:
- Controllers **не** работают с `Result` напрямую. Только через presentation-service.
- Текущая реализация: `throw new BadRequestException(errorCode)` для всех бизнес-ошибок, `throw new InternalServerErrorException()` для технических (extract IP и т.п.). Это **временная** простота — tracked в R08 и в baseline отчёте.
- Целевая реализация (план): глобальный `ExceptionFilter`, который смотрит на suffix error code'а и выбирает HTTP статус по таблице из R08.

## Чек-лист (при написании handler'а / repository)

- [ ] Сигнатура возвращает `Promise<Result<T, E>>` (или `Result<T, E>` для синхронного)
- [ ] `E` — именованный тип из `*.errors.ts`, не `string`
- [ ] Все `await` обёрнуты через `fromAsyncThrowable` или возвращают `Result` сами
- [ ] Нет `try/catch` (кроме `runInTransactionResult` и подобных низкоуровневых утилит)
- [ ] Нет `throw new Error(...)` (кроме presentation/main)

### Чек-лист для error codes

- [ ] Все коды в `SCREAMING_SNAKE_CASE`
- [ ] Структура: `<OPERATION>_<SUB-NAMESPACE>_<REASON>` (или `<OPERATION>_<REASON>` для простых случаев)
- [ ] Suffix берётся из approved-таблицы (`_INVALID_*`, `_NOT_FOUND`, `_CONFLICT`, `_LOCKED`, `_EXPIRED`, `_FAILED`, `_DB_ERROR`, `_TX_ERROR`, `_TARGET_MISSING`, `_RATE_LIMIT_EXCEEDED`, `_ALREADY_EXISTS`, `_ERROR`, `_INTERNAL_ERROR`)
- [ ] `_ERROR` (catch-all) — только после специфичных кодов и только с двухуровневым namespace'ом (`<OP>_<SUB>_ERROR`)
- [ ] `_INTERNAL_ERROR` — только когда невозможно классифицировать иначе (не для лени)
- [ ] Нет `'ERROR'`, `'UNKNOWN'`, `'FAILED'` без префикса
- [ ] Repository — **один тип на метод** (`<Repo><Method>ErrorCode`)
- [ ] Repository UPDATE-методы имеют `_TARGET_MISSING` для пустого affectedRows
- [ ] Repository методы с парсингом raw-ряда имеют `_INVALID_ROW_SHAPE`
- [ ] Handler собирает union из repository ErrorCode'ов + своих специфичных бизнес-ошибок
- [ ] Type guards для разбора throwable-исключений лежат в `src/lib/<system>/` или рядом с `*.errors.ts`
