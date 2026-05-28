# Playbook: spec-check (feature-based)

Детальная инструкция для команды `/spec-check <feature>`. Агент следует ей строго.

## Вход

Свободный текст, описывающий **фичу** — то, что пользователь хочет проверить. Примеры валидного входа:

- `"user sign-in flow"` — фича словами
- `"compliance package upload для originator"` — фича с доменным контекстом
- `"auth TOTP setup"` — компонент фичи
- `"POST /intent/compliance-package/upload-originator"` — endpoint
- `"модуль auth"` / `"auth module"` — целый bounded context
- `"intent state machine"` — cross-cutting концепт
- `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts` — путь (backwards compat)

Агент **сам распознаёт** форму входа и выбирает стратегию resolution.

## Алгоритм

### Фаза 1: Resolution (вход → set файлов)

**Цель:** превратить текст в набор `.ts` файлов в `src/`, которые составляют фичу.

#### Стратегия A: вход похож на путь
Если вход содержит `src/` или заканчивается на `.ts` — интерпретировать как путь и пропустить к фазе 2.

#### Стратегия B: вход похож на endpoint
Если вход содержит HTTP-метод (`GET|POST|PUT|PATCH|DELETE`) или начинается со слэша:
1. Извлеки метод и путь
2. `Grep`: найди контроллер с `@Post('<path>')` / `@Get('<path>')` / и т.д. в `src/modules/**/presentation/**/*.controller.ts`
3. Прочитай найденный controller
4. От контроллера трассируй вызовы в presentation-service → handler
5. Дальше идёт по цепочке зависимостей (см. стратегию D)

#### Стратегия C: вход — имя модуля
Если вход — одно слово, совпадающее с папкой в `src/modules/`:
1. `Glob` `src/modules/<name>/**/*.ts`
2. Отфильтруй по типам из `manifest.yaml → file_types`
3. Вернуть все найденные файлы

#### Стратегия D: свободный текст фичи (основной кейс)
Это самый частый случай. Агент делает **семантическое** разрешение:

1. **Извлеки ключевые слова** из текста:
   - действия: `sign-in`, `upload`, `verify`, `activate`, `create`, `confirm`, `escalate`, `generate`
   - домены: `auth`, `user`, `intent`, `compliance`, `partner`, `encryption`, `session`, `transfer`
   - объекты: `OTP`, `TOTP`, `JWT`, `challenge`, `package`, `card`, `UBO`, `RFI`, `DEK`
   - роли: `originator`, `beneficiary`, `admin`, `partner`

2. **Найди основной handler(ы) фичи:**
   - `Grep` по имени action'а в `src/modules/**/use-case/**/*.handler.ts` (например, `sign-in` → `sign-in.handler.ts`)
   - Если нашлось несколько — все они в наборе (fuzzy match принимается; не отбрасывай лишнее на этом этапе)

3. **Трассируй граф зависимостей** от каждого найденного handler'а:
   - **Вверх** (что вызывает handler):
     - `Grep`: `<HandlerName>` в presentation-services → добавь их
     - `Grep`: соответствующие `*.controller.ts` через presentation-service → добавь
     - DTO, которые controller принимает → добавь из `Grep`/импортов
   - **Вниз** (что handler вызывает):
     - Читай handler целиком, вытаскивай импортированные классы
     - Каждый `*.repository.ts`, `*.service.ts`, `*.external.service.ts`, `*.handler.ts` (sub-handler'ы) → добавь в набор
     - Для repositories → добавь соответствующий `*.entity.ts`
     - Для repositories → добавь `*.errors.ts`
   - **Sideways** (связанные файлы):
     - Если фича касается state machine — добавь `modules/<name>/domain/<entity>.ts` с enum'ом и (если есть) `.fsm.ts`
     - Если фича касается compliance — добавь `compliance-package` DTO
     - Если фича касается событий — добавь `domain/events/*.event.ts` если есть

4. **Cap глубины:** не больше 2 уровней вниз от исходных handler'ов. Иначе резолвинг взорвётся.

5. **Отбросить явно нерелевантное:**
   - `src/lib/*` — библиотечный код, не относится к фиче
   - `src/infrastructure/*` — общая инфраструктура (db/datasource, redis/client), кроме случая когда вход **и есть** инфраструктура
   - `*.module.ts` — NestJS-модули, структурный шум, не бизнес-правила
   - Тесты — `*.spec.ts`, `*.e2e-spec.ts`

6. **Финальный список:** 5–30 файлов обычно. Если больше 30 — скорее всего вход слишком широкий, уточни у пользователя.

#### Если resolution провалился

Если агент не может уверенно resolve'ить вход:
- Покажи пользователю **что нашёл** («по запросу "X" я нашёл handlers: A, B. Проверять их?»)
- Попроси уточнения
- Не гадай вслепую

### Фаза 2: Per-file checking

Для **каждого файла** из resolved набора:

1. Определи тип файла через `manifest.yaml → file_types` (по паттерну).
2. Собери применимые спеки из `applies`.
3. Прочитай файл целиком.
4. Прочитай соответствующие спеки из `.claude/rules/` (только те, что ещё не в контексте — R12/R13 уже автозагружены, R01-R11 читай по мере необходимости).
5. Пройди по чек-листам каждой спеки.
6. Собери нарушения.

### Фаза 3: Aggregation и отчёт

#### Формат отчёта

```markdown
# spec-check: <feature описание как в input>

**Резолвинг:** <стратегия: endpoint / module / feature text / path>
**Найдено файлов:** 12
**Применённые спеки:** R02, R03, R05, R08, R10, R12, R13

---

## Граф фичи

<ASCII или bullet-список файлов с краткой ролью>

- controllers/auth/auth-presentation.controller.ts — HTTP endpoint
- presentation/auth-presentation.service.ts — маппинг Result → HTTP
- use-case/presentation/sign-in/sign-in.handler.ts — main handler
  - strategies/sign-in-email/sign-in-email.handler.ts — sub-handler
  - strategies/sign-in-totp/sign-in-totp.handler.ts — sub-handler
  - resolve-pending-challenge/... — sub-handler
- infrastructure/repositories/auth-challenge/auth-challenge.repository.ts
- infrastructure/repositories/auth-user-profile/auth-user-profile.repository.ts
- dto/sign-in.dto.ts — Request/Response
- domain/auth-challenge.ts — enum'ы и константы

---

## ❌ Errors (N)

### R03 — «handler возвращает Result<T,E>»
**Файлов с нарушением:** 2

- `src/modules/auth/use-case/presentation/sign-in/strategies/sign-in-email/sign-in-email.handler.ts:47`
  `run()` возвращает `Promise<SignInResult>`, должен `Promise<Result<SignInResult, SignInEmailErrorCode>>`
- `src/modules/.../another.handler.ts:12`
  Аналогично

### R13 — «DTO-35 массив nested требует четырёхдекораторную цепочку»
**Файлов с нарушением:** 1

- `src/modules/intent/presentation/compliance-package/dto/compliance-package/cards/company-card/company-card.dto.ts:30-34`
  Пропущен `@ArrayMinSize(1)` для `nameIdentifiers`

---

## ⚠️ Warnings (M)

### R12 CV-07 — «промежуточные переменные <verb><Noun>Result»
**Файлов с нарушением:** 3

- `.../sign-in.handler.ts:64` — `const u = await ...` вместо `findUserResult`
- ...

---

## ℹ️ Info (K)

### R10 — опечатка в идентификаторе
- `src/modules/user/infrastructure/repositories/user/user.repository.ts:17` — `repsoitory` вместо `repository` (tracked в baseline)

---

## Агрегация по спекам

| Спека | Нарушений | Тяжесть |
|---|---|---|
| R02 | 0 | ✅ |
| R03 | 2 | ❌ error |
| R05 | 0 | ✅ |
| R08 | 1 | ⚠️ warning |
| R10 | 4 | ⚠️ warning |
| R12 | 3 | ⚠️ warning |
| R13 | 1 | ❌ error |

## Топ-3 места, требующие внимания

1. **sign-in-email.handler.ts:47** — R03:error (контракт handler'а нарушен)
2. **company-card.dto.ts:30-34** — R13:error (обязательный декоратор пропущен)
3. **auth-challenge.repository.ts:23** — R02:warning (throw вместо err)

## Семантические вопросы (⚠ требуют ручного решения)

Эти вопросы — не нарушения правил, а места, где нужна оценка владельца:

- `sign-in.handler.ts:110` — вызов `resolvePendingChallengeHandler.run(...)` возвращает ошибку `SIGN_IN_INTERNAL_ERROR` на отсутствие profile; разумно ли это? (R11 state-handling)
- `compliance-package.dto.ts` не имеет versioning поля — при изменении схемы ломается backward compat? (открытый вопрос из baseline)

## Вердикт

- ❌ **Фича не проходит** — 3 error'а
- Для merge'а исправить: R03 (2), R13 (1)
- Warning'и — рекомендуется исправить в том же PR
- Info — tracked, можно отложить
```

## Правила поведения

- **Фаза 1 критична.** Если резолвинг плохой — весь отчёт мусор. Будь явен про то, что нашёл; если сомневаешься — спроси.
- **Не исправляй код** автоматически. Только отчёт.
- **Цитаты из правил — точные.** Если не уверен в формулировке — перечитай спеку.
- **Не выдумывай правила.** Только из `.claude/rules/`.
- **Агрегируй умно.** Если одно и то же правило нарушено в 5 файлах — не пиши 5 отдельных секций, пиши один блок с 5 location'ами.
- **Уважай R12 и R13** — они автозагружены, ссылайся на них по CV-XX / DTO-XX номерам.
- **Не пихай в отчёт всё подряд.** Нарушения `*.module.ts`, тестов, `src/lib/*` — в отчёт не идут. Только бизнес-код фичи.

## Управление контекстом

Если фича большая (20+ файлов):
- Читай файлы **порциями** по 5–10, сразу собирай нарушения в память
- После обработки всех — компонуй отчёт
- Не загружай все 20 файлов одним Read — контекст перегрузится

Если нужно, спавни под-агента для checking'а подмножества (например, только DTOs) — это опционально и только при реально большом объёме.

## Специальные кейсы

### Вход: «модуль auth»
→ Стратегия C. Glob всех `src/modules/auth/**/*.ts`, фильтр по типам. Обычно 30–60 файлов — это много. Предупреди пользователя и предложи сузить («проверить только handlers?», «только presentation?»).

### Вход: «все compliance cards»
→ Стратегия D. Найди все `cards/**/card.dto.ts` и `components/**/*.dto.ts`. Применяй только R13 (+R10).

### Вход: «FSM Intent»
→ Стратегия D. Найди `modules/intent/domain/intent.ts`, `modules/intent/domain/intent.fsm.ts` (если есть), все handler'ы в `modules/intent/use-case/` которые меняют state. Применяй R11 + R02 + R03.

### Вход пустой
→ Ошибка. Требуй аргумент.
