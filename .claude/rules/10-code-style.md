# 10. Code style

## TypeScript

- **`strict: true`** — всегда. Конфиг — `tsconfig.json:14`.
- `strictPropertyInitialization: false` — намеренно, для работы с class-validator DTO (`tsconfig.json:15`).
- `noFallthroughCasesInSwitch: true` — все `case` должны завершаться `return` / `break` / `throw`.
- **Никаких `any`.** Используй `unknown` + narrowing. `as any` — запрещён, кроме low-level адаптеров (`neverthrow` type coercion, TypeORM metadata).
- **Никаких `// @ts-ignore` / `// @ts-expect-error`** без комментария, объясняющего почему.
- **Возвращаемые типы всех публичных методов указаны явно.** Не полагаемся на inference.
- **`readonly`** на полях класса, которые не переприсваиваются после конструктора.
- **`const`** по умолчанию. `let` — только там, где реально нужна мутация.
- **Никаких namespace'ов.** Только ES modules.
- **Enum'ы — string enums**, не numeric. Эталон — `src/modules/intent/domain/intent.ts:1-7`.

## Naming

| Сущность | Стиль | Пример |
|---|---|---|
| Переменная, параметр, свойство | `camelCase` | `userId`, `createUserResult` |
| Функция, метод | `camelCase` | `findByEmail`, `normalizeAAD` |
| Класс, interface, type alias | `PascalCase` | `CreateUserHandler`, `FlatAAD` |
| Error codes (string literals) | `SCREAMING_SNAKE_CASE` | `'CREATE_USER_CONFLICT'` |
| Константы | `SCREAMING_SNAKE_CASE` | `IV_LEN`, `KEY_LEN` |
| Файл | `kebab-case` | `create-user.handler.ts` |
| Директория | `kebab-case` | `use-case/create-user/` |
| Таблица / колонка БД | `snake_case` | `partner_compliance_profiles.legal_entity_name` |
| Env-переменная | `SCREAMING_SNAKE_CASE` | `DB_HOST`, `KMS_KEY_ID` |

### Правила

- **Никаких опечаток в идентификаторах.** `repository`, не `repsoitory` (в существующем коде есть — `user.repository.ts:17`, не копируй). `completed`, не `complited`. `evidence`, не `evidance`. `heartbeat`, не `hearbeat`. При ревью — останавливаем и исправляем.
- **Сокращения допустимы только для общеизвестных терминов:** `id`, `url`, `ip`, `jwt`, `dto`, `dek`, `kek`, `aad`, `iv`, `kms`, `rfi`, `ubo`, `kyb`, `kyc`, `pii`. Всё остальное — полное слово.
- **Нет венгерской нотации.** `IUserRepository` — нет. `UserRepository` — да.
- **Booleans читаются как утверждение:** `totpEnabled`, не `totp`. `isActive` — ок, но в существующем стиле чаще без `is`.

## Размер

- **Файл handler'а** — до ~200 строк. Больше — декомпозируем на sub-handlers.
- **Метод** — до ~50 строк. `SignInHandler.run` (~110 строк) — верхняя граница допустимого, и то потому что логика линейна.
- **Класс** — до ~300 строк. `EncryptionService` (304 строки) — исключение, оправдано документацией.
- **Функция** — одна ответственность. Если `run()` делает 5 разных вещей — её задача декомпозировать, не расширять.

## Комментарии

- **По умолчанию — не пишем.** Код самодокументируется через именование и типы.
- **Пишем** для:
  - **нетривиальной инвариантности** — почему код такой, а не другой (например, почему AAD нормализуется — `encryption.service.ts:237-260`);
  - **workaround'ов** — с ссылкой на issue / тикет;
  - **публичных API** (library code в `src/lib/`) — JSDoc с `@param` / `@returns`;
  - **security-чувствительного кода** — что именно защищается.
- **Не пишем**:
  - что делает строка кода (`// increment counter`);
  - историю изменений (`// previously used X, now Y`);
  - имена исполнителей / тикетов внутри кода (это в PR / commit message).
- Комментарии — на английском, **кроме** комментариев к бизнес-логике, где термин домена на русском точнее. В этом проекте — английский по умолчанию.

## Импорты

- **Относительные пути внутри модуля** (`./user.entity`, `../../domain/user`).
- **Абсолютные через `src/`** — только если цепочка `../../../../` становится нечитаемой. Эталон вынужденного абсолютного — `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts:11`.
- **Группировка импортов:** 1) внешние библиотеки → 2) `src/lib/` → 3) другие модули → 4) соседние файлы. Пустая строка между группами не обязательна, но порядок — да.
- **Нет неиспользуемых импортов.** Линтер должен ловить.

## Линтер и форматтер

- **ESLint** — `@typescript-eslint/recommended` + `prettier`. Сейчас `no-explicit-any: off` — это **слабость, которую постепенно закрываем**. Новый код не использует `any`, даже если линтер пропустит.
- **Prettier** — `singleQuote: true`, `trailingComma: all`. Не отключать локально.
- **Перед коммитом** — `npm run lint` / `npm run format`. Или pre-commit hook.

## Что нельзя оставлять в коде

- [ ] `console.log` (заменяется на `Logger` из `@nestjs/common`). Текущий `src/infrastructure/db/datasource.ts:7` — tracked bug, не ориентир.
- [ ] Закомментированный код. Удаляем.
- [ ] `TODO` без issue-ссылки. `// TODO(JIRA-123): ...` — ок, просто `// TODO: fix later` — нет.
- [ ] Мёртвые файлы / директории `old/`, `deprecated/`. Если код не нужен — удаляется в том же PR.
- [ ] Неиспользуемые экспорты.

## Чек-лист code style (при ревью)

- [ ] TypeScript strict, никаких `any`
- [ ] Naming по таблице, никаких опечаток в идентификаторах
- [ ] Файлы и методы в пределах допустимого размера
- [ ] Нет лишних комментариев «что делает код»
- [ ] Нет `console.log`, `TODO` без issue, закомментированного кода, директорий `old/`
- [ ] Импорты сгруппированы, нет неиспользуемых
- [ ] ESLint без semantic-ошибок (prettier-warnings допустимы — автофикс не запускается)
- [ ] Формат соответствует R12 (ритм, отбивки, переносы) — проверено глазами, не prettier'ом
