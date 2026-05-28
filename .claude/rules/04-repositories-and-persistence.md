# 04. Repositories и персистентность

## Структура

Для каждой таблицы:

```
modules/<name>/infrastructure/repositories/<entity>/
  <entity>.entity.ts              # TypeORM entity
  <entity>.repository.ts          # @Injectable класс
  <entity>.repository.module.ts   # Nest module (TypeOrmModule.forFeature + provider)
  <entity>.repository.errors.ts   # error codes
  <entity>.utilities.ts           # (опционально) мапперы entity↔domain
```

Эталон — `src/modules/user/infrastructure/repositories/user/`.

## Правила repository

1. **Repository работает только с одной таблицей.** Если нужен join — делай отдельный query-сервис или делай явный `QueryBuilder` в том же repository, но не смешивай несколько сущностей.
2. **Методы возвращают `Result<T, E>`.** Не `T | null`, не `throw`. Эталон — `user.repository.ts:20-70`.
3. **Оборачивай TypeORM-вызовы в `fromAsyncThrowable`.** См. `02-result-and-errors.md`, правило №5.
4. **Error mapping через type guards.** Не `e instanceof QueryFailedError` — используй `src/lib/typeorm/is-unique-error.ts` и аналогичные. Нужен новый guard — добавляй в `src/lib/typeorm/`.
5. **Репозиторий возвращает domain-тип, а не entity.** Маппинг entity → domain делается либо прямо в методе, либо через утилитарную функцию в `*.utilities.ts`.
6. **`findBy*` возвращает `Result<T | undefined, E>`.** Отсутствие записи — не ошибка. Эталон — `user.repository.ts:44-70`.

## Entity

- Имя файла: `<entity>.entity.ts`, класс: `<Entity>Entity`.
- Колонки — `snake_case` в БД, `camelCase` в TypeScript. TypeORM маппинг через `@Column({ name: 'snake_case' })` или `namingStrategy`.
- **Не делать бизнес-логику в entity.** Entity — DTO для БД, ничего больше.
- **Defaults для `jsonb` / `json` — JS-литералы (`default: {}`, `default: []`), не raw-SQL (`default: () => "'{}'::jsonb"`).** Raw-SQL default приводит к false-positive drift при `migration:generate`: TypeORM сравнивает строку default'а entity со строкой `column_default` из Postgres, Postgres нормализует (убирает `::jsonb`, кавычки), сравнение не бьётся — и TypeORM на каждом запуске генерит `ALTER COLUMN ... SET DEFAULT`. JS-литерал TypeORM сериализует и сравнивает корректно. Пример правильного — `partner-onboarding-draft.entity.ts:44-66`.

## Миграции

- Живут в `src/infrastructure/db/migrations/`.
- Имя файла: `<timestamp>-<description>.ts`, класс: `<Description><timestamp>`.
- **SQL пишется руками** внутри `queryRunner.query(/* sql */ \`...\`)`. Не использовать TypeORM schema-builder (`createTable`, `addColumn`) для новых миграций. Эталон — `src/infrastructure/db/migrations/1775751093754-partner-onboarding.ts:6-60`.
- Комментарий `/* sql */` перед шаблонной строкой — для подсветки синтаксиса.
- **Все constraints явные и именованные**: `pk_<table>`, `fk_<table>_<ref>`, `uq_<table>_<cols>`, `ix_<table>_<cols>`.
- **ENUM'ы — через `CREATE TYPE`**, не `CHECK (col IN ...)`.
- **Зашифрованные поля — `bytea`.** Рядом обязательны `dek bytea NOT NULL` и `aad json NOT NULL`. Эталон — `partner-onboarding.ts:49-58`.
- **Миграции никогда не редактируются после merge.** Исправление — новая миграция.
- `up` и `down` — обе реализованы. `down` не может быть заглушкой «бросить ошибку».

## Naming в БД

- Таблицы — `snake_case`, множественное число (`users`, `partner_compliance_profiles`).
- Колонки — `snake_case`, единственное число (`user_id`, `created_at`).
- Timestamp-колонки — `created_at`, `updated_at`, `deleted_at`, `<action>ed_at` (`system_verified_at`).
- Bool-колонки — без префикса `is_` (`aml_policy_exists`, `totp_enabled`) — следуя существующему стилю.

## Чек-лист repository

- [ ] Класс `@Injectable()` с полным именем `<Entity>Repository`
- [ ] Инжект TypeORM-репозитория через `@InjectRepository(<Entity>Entity)`
- [ ] Все методы возвращают `Promise<Result<..., ...ErrorCode>>`
- [ ] TypeORM-вызовы обёрнуты в `fromAsyncThrowable`
- [ ] Специфичные ошибки (unique conflict, FK violation) определены через type guards
- [ ] Возвращаемый тип — domain-тип, не entity
- [ ] Есть соответствующий `*.repository.module.ts` с `TypeOrmModule.forFeature([<Entity>Entity])`
- [ ] `*.repository.errors.ts` содержит все возможные коды
- [ ] Никакой бизнес-логики (агрегаций, расчётов, state-переходов) — только CRUD + простые query

## Чек-лист миграции

- [ ] Имя файла: `<timestamp>-<kebab-description>.ts`
- [ ] Класс: `<PascalDescription><timestamp>`
- [ ] SQL внутри `queryRunner.query(/* sql */ \`...\`)` — никакого schema-builder
- [ ] Constraints именованы (`pk_`, `fk_`, `uq_`, `ix_`)
- [ ] `down` реализован и откатывает `up`
- [ ] Зашифрованные поля сопровождаются `dek` и `aad`
- [ ] Старые миграции не тронуты
