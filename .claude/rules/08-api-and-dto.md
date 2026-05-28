# 08. API, DTO, presentation-слой

## Структура presentation-модуля

```
modules/<name>/presentation/
  <name>-presentation.controller.ts   # @Controller, только роутинг
  <name>-presentation.service.ts      # маппинг Result → HttpException, вызов handler'ов
  <name>-presentation.module.ts       # сборка: controller + service + handler-модули
  dto/                                # DTO запросов/ответов
  guards/                             # Nest guards (JwtGuard, RefreshGuard, ...)
  lib/                                # вспомогательные декораторы, cookies, и т.п.
```

Эталон — `src/modules/auth/presentation/`.

## Controller

Правила:
1. **Только роутинг.** Никакой бизнес-логики. Эталон — `src/modules/auth/presentation/auth-presentation.controller.ts:36-114`.
2. **Один публичный метод = одна `@Post`/`@Get`/`@Put`/`@Delete`.**
3. **Метод controller'а вызывает ровно один метод presentation-service'а.**
4. **Обязательные Swagger-декораторы** на каждом методе:
   - `@ApiOperation({ operationId: '<camelCaseAction>' })`;
   - `@ApiResponse({ type: <DtoRes> })` (если есть тело ответа);
   - `@ApiTags('<Module>')` на уровне класса;
   - `@ApiBearerAuth()` для защищённых маршрутов.
5. **Guards** — через `@UseGuards(JwtGuard)` / `@UseGuards(RefreshGuard)`.
6. **Извлечение контекста запроса** — только через декораторы (`@Req()`, `@Res()`, `@Body()`, `@Jwt()`, `@RefreshToken()`). Никаких ручных парсингов.

## Presentation-service

Роль — **единственная точка маппинга `Result → HttpException`**. Эталон — `src/modules/auth/presentation/auth-presentation.service.ts:62-78`:

```ts
async signIn(req: Request, dto: SignInDtoReq): Promise<SignInDtoRes> {
  const extractIpResult = extractIp(req);
  if (extractIpResult.isErr()) {
    throw new InternalServerErrorException();
  }
  const signInHandlerResult = await this.signInHandler.run({
    ip: extractIpResult.value,
    email: dto.email,
    password: dto.password,
  });
  if (signInHandlerResult.isErr()) {
    throw new BadRequestException(signInHandlerResult.error);
  }
  return signInHandlerResult.value;
}
```

Правила:
1. **Инжектит handler'ы, не репозитории и не инфраструктуру.** Если нужен repository — значит, нужен handler.
2. **Готовит `Params` для handler'а** из DTO + request context (IP, user из JWT, cookies).
3. **Маппит `Result.error` в `HttpException`.** Сейчас допустимо `throw new BadRequestException(errorCode)`. По мере развития — отдельный Exception Filter (см. ниже).
4. **Возвращает DTO ответа,** не domain-тип. Если handler возвращает domain — сервис маппит.
5. **Устанавливает cookies / headers** (например, refresh token). Handler этого не делает.

## DTO

Правила:
1. **Naming**: `<Action>DtoReq` / `<Action>DtoRes`. Эталон — `src/modules/auth/presentation/dto/sign-in.dto.ts`.
2. **`@ApiSchema({ name: 'SignInRequest' })`** — имя схемы для Swagger без суффикса `Dto`.
3. **Валидация через `class-validator`:** `@IsEmail`, `@IsString`, `@MinLength`, `@MaxLength`, `@IsEnum`, `@IsUUID`, etc. Все поля имеют хотя бы один decorator.
4. **`@ApiProperty`** на каждом поле с `example` и (где уместно) `minLength`/`maxLength`/`enum`.
5. **DTO implement'ит типы handler'а** там, где это возможно:
   ```ts
   export class SignInDtoReq implements Omit<SignInParams, 'ip'> { ... }
   export class SignInDtoRes implements SignInResult { ... }
   ```
   Это гарантирует, что DTO и handler не разъедутся.
6. **Никакой бизнес-логики в DTO.** Только поля и decorators.
7. **DTO не реиспользуются между request и response.** Даже если поля совпадают — два класса.

## `ValidationPipe`

Глобально настроен в `src/main.ts`. Обязательные опции:
- `whitelist: true` — лишние поля режутся;
- `forbidNonWhitelisted: true` — лишние поля → `BadRequestException`;
- `transform: true` — автоконвертация primitives;
- `transformOptions: { enableImplicitConversion: true }`.

Не изменять локально (`@UsePipes(new ValidationPipe({...}))`) без крайней необходимости.

## Guards и декораторы

- `JwtGuard` — access token из `Authorization: Bearer <...>`.
- `RefreshGuard` — refresh token из HTTP-only cookie.
- `@Jwt()` — извлекает `JwtPayload` из request.
- `@RefreshToken()` — извлекает raw refresh token.
- `AdminGuard` / `ManagerGuard` — role-based, проверяют `UserRole` из БД, не из JWT.

Новый guard:
- живёт в `modules/<name>/presentation/guards/`;
- реализует `CanActivate`;
- возвращает `boolean` (НЕ throw'ит — Nest сам превратит в `ForbiddenException`);
- документируется комментарием-однострочником о том, что проверяет.

## Маппинг error codes на HTTP

### Текущая реализация (как есть)

**Все** бизнес-ошибки → `BadRequestException(errorCode)` → HTTP 400. Технические (extract IP failed) → `InternalServerErrorException()` → HTTP 500.

Эталон — `src/modules/auth/presentation/auth-presentation.service.ts:62-78`:
```ts
const signInHandlerResult = await this.signInHandler.run({...});
if (signInHandlerResult.isErr()) {
  throw new BadRequestException(signInHandlerResult.error);
}
return signInHandlerResult.value;
```

**Response shape (исходящий)** — стандартный NestJS:
```json
{
  "statusCode": 400,
  "message": "SIGN_IN_INVALID_CREDENTIALS",
  "error": "Bad Request"
}
```

`message` — это сырой error code. Frontend парсит его как строковый дискриминант.

### Известные проблемы (tracked в baseline)

1. **Всё → 400** — невозможно отличить `RATE_LIMIT_EXCEEDED` (должно быть 429) от `INVALID_CREDENTIALS` (400) от `NOT_FOUND` (404) на уровне HTTP.
2. **TooManyRequestsException** существует в `src/lib/nest/too-many-requests-exception.ts` — но **dead code**, ни одного использования.
3. **Нет глобального ExceptionFilter** — каждый presentation-service дублирует одну и ту же логику маппинга вручную.

### Целевая таблица маппинга (target state)

Когда будет внедрён глобальный ExceptionFilter, маппинг строится **по suffix'у error code'а**, а не по полному коду:

| Suffix в error code | HTTP status | NestJS exception |
|---|---|---|
| `_NOT_FOUND` | 404 | `NotFoundException` |
| `_CONFLICT`, `_ALREADY_EXISTS` | 409 | `ConflictException` |
| `_LOCKED` | 423 | custom `LockedException` |
| `_RATE_LIMIT_EXCEEDED`, `_COOLDOWN_ACTIVE` | 429 | `TooManyRequestsException` (`src/lib/nest/`) |
| `_EXPIRED` | 410 | `GoneException` |
| `_INVALID_*`, `_PROFILE_NOT_ACTIVATED` | 400 | `BadRequestException` |
| `_INVALID_CREDENTIALS` | 401 | `UnauthorizedException` |
| `_FORBIDDEN` (если появится) | 403 | `ForbiddenException` |
| `_DB_ERROR`, `_TX_ERROR`, `_REDLOCK_ERROR`, `_*_FAILED` (тех. ошибки) | 500 | `InternalServerErrorException` |
| `_INTERNAL_ERROR` | 500 | `InternalServerErrorException` |
| `_ERROR` (catch-all внутри namespace'а) | 500 | `InternalServerErrorException` |
| Всё прочее | 400 | `BadRequestException` |

**Логика выбора:** filter смотрит на error code, ищет longest matching suffix из таблицы, выбирает соответствующий HTTP-статус.

### Целевой response shape

После внедрения filter'а **frontend получает** структурированный JSON:

```json
{
  "code": "SIGN_IN_RATE_LIMIT_EXCEEDED",
  "message": "Too many sign-in attempts. Try later.",
  "statusCode": 429,
  "details": {
    "retryAfter": 60
  }
}
```

Где:
- `code` — точный error code из union'а (то, что раньше было в `message`)
- `message` — human-readable (опциональный; для compliance/auth — может быть пустой строкой, чтобы не утечь информацию)
- `statusCode` — HTTP-статус
- `details` — структурированные данные (например, `retryAfter` для rate limit, `field` для validation errors)

### Что делать сейчас (до внедрения filter'а)

- **Новые presentation-services** — пиши как существующие: `throw new BadRequestException(errorCode)` для бизнес-ошибок, `throw new InternalServerErrorException()` для технических (`extractIp`-style).
- **Не выдумывай свой response shape** — придерживайся стандартного NestJS, чтобы переход на global filter был механическим.
- **Не используй `TooManyRequestsException` точечно** — либо все коды через filter, либо никто. Точечное использование = inconsistency.
- **Не маппь error codes на статусы вручную** в каждом presentation-service — это будет boilerplate, который при переходе на filter надо будет вычищать.

### План миграции на global filter (для будущего PR)

1. Реализовать `src/lib/nest/spec-error.filter.ts` — `@Catch(HttpException)` или `@Catch()` filter, который:
   - Получает exception
   - Если внутри `BadRequestException` лежит наш error code (по regex `^[A-Z][A-Z0-9_]*$`) — применяет таблицу выше
   - Возвращает структурированный JSON
2. Зарегистрировать в `main.ts`: `app.useGlobalFilters(new SpecErrorFilter())`
3. Прогнать все presentation-services — убрать boilerplate маппинга, оставить только `throw new BadRequestException(errorCode)`
4. Обновить frontend на чтение `code` вместо `message`
5. Удалить tracked item из baseline, обновить R02 + R08

Это **отдельная задача** (1–2 PR), не часть текущей работы. Здесь зафиксировано как roadmap.

## Чек-лист controller'а

- [ ] `@Controller('<path>')` + `@ApiTags('<Name>')`
- [ ] Каждый метод имеет `@ApiOperation({ operationId })` + `@ApiResponse({ type })`
- [ ] Нет бизнес-логики, только `return this.service.<method>(...)`
- [ ] Guards через `@UseGuards`, контекст через декораторы
- [ ] Защищённые эндпоинты имеют `@ApiBearerAuth()`

## Чек-лист presentation-service'а

- [ ] Инжектит только handler'ы (+ опционально утилиты типа `extractIp`)
- [ ] Не работает с БД, Redis, RabbitMQ напрямую
- [ ] Для каждого метода: распаковка DTO → `handler.run` → проверка `.isErr()` → `throw HttpException(error)` → возврат DTO
- [ ] Cookies / headers устанавливаются здесь, не в handler'е

## Чек-лист DTO

- [ ] Имя `<Action>DtoReq` / `<Action>DtoRes`
- [ ] `@ApiSchema({ name: '<Action>Request' | '<Action>Response' })`
- [ ] Все поля с `@ApiProperty` + validator decorator
- [ ] `implements` типа handler'а где уместно
- [ ] Нет методов / логики
