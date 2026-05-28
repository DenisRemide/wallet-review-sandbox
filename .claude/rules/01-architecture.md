# 01. Архитектура

## Слои

```
presentation  →  use-case (handlers)  →  domain + repositories  →  infrastructure
```

- **presentation** — контроллеры NestJS, DTO, Swagger, guards. Только HTTP/транспорт.
- **use-case** — handlers с бизнес-логикой. Один handler = одна операция.
- **domain** — типы, enum'ы, константы домена. Без зависимостей от NestJS, TypeORM, Redis.
- **infrastructure** — repositories (TypeORM), внешние сервисы, брокеры, KMS.

Зависимости идут **строго вниз**. Domain не знает про infrastructure. Use-case не знает про presentation.

## Bounded contexts (модули)

Каждый домен живёт в `src/modules/<name>/`:

```
src/modules/<name>/
  domain/                       # типы, enum'ы, конфиги домена
  use-case/<operation>/         # один handler + его модуль + errors
    <operation>.handler.ts
    <operation>.module.ts
    <operation>.errors.ts
  infrastructure/
    repositories/<name>/        # TypeORM entity + repository + module + errors
    <external-system>/          # например, jwt/, admin/
  presentation/                 # controllers, DTO, guards, presentation.service
  external/                     # публичное API модуля для других модулей
```

Эталон — `src/modules/user/` и `src/modules/auth/`.

## Правила межмодульного взаимодействия

- **Модуль `A` не импортирует `modules/B/use-case/...` или `modules/B/infrastructure/...` напрямую.**
- Публичный контракт модуля — это `modules/<name>/external/<name>-external.service.ts`. Пример: `src/modules/user/external/user-external.service.ts:11-35` — фасад над handler'ами модуля `user`.
- Если нужно расширить контракт — добавляется метод в `external-service`, не прямой импорт handler'а.
- `domain/` можно импортировать между модулями, если это общий тип. Всё остальное — нельзя.

## Регистрация модулей

- Корневой модуль — `src/app.module.ts`. Новые presentation-модули регистрируются тут.
- Cross-cutting модули (`DBModule`, `ScheduleModule`, `JwtModule`, `KmsModule`, `OutboxSynchronizationModule`) — тоже тут.
- **Global JWT**: регистрируется один раз в `app.module.ts:14-18` с `HS256`. Не регистрировать повторно в других модулях.

## Чек-лист архитектуры (при создании нового модуля)

- [ ] Директория `src/modules/<name>/` создана с под-директориями `domain/`, `use-case/`, `infrastructure/`, `presentation/`, `external/` по мере необходимости
- [ ] Для каждого use-case создан отдельный каталог с тройкой `*.handler.ts` + `*.module.ts` + `*.errors.ts`
- [ ] Для каждой таблицы есть `*.entity.ts` + `*.repository.ts` + `*.repository.module.ts` + `*.repository.errors.ts`
- [ ] Публичный контракт вынесен в `external/<name>-external.service.ts`
- [ ] Нет прямых импортов из `../modules/<other>/use-case/...` или `../modules/<other>/infrastructure/...`
- [ ] Presentation-модуль (если есть HTTP) зарегистрирован в `src/app.module.ts`
- [ ] `domain/` свободен от импортов NestJS, TypeORM, Redis, amqplib

## Чек-лист архитектуры (при ревью)

- [ ] Нет слоёв-заглушек — каждый слой делает своё (controller не ходит в репозиторий напрямую, минуя handler)
- [ ] Нет god-сервисов (файл с 20 методами — это признак того, что надо разбить на use-case handlers)
- [ ] Нет cross-module импортов внутрь `use-case`/`infrastructure` чужого модуля

## Content-ответственность слоёв

R01 описывает **границы между модулями и слоями**. **Что именно** делает каждый слой внутри этих границ — ответственность отдельных спек:

- **Use-case** не имплементирует, а оркеструет. Не знает формы raw-row БД, не шифрует вручную, не хранит доменные парсеры. См. **R14** (`14-use-case-boundaries.md`).
- **Repository** возвращает domain-тип, не entity. См. **R04** §5.
- **Presentation-service** вызывает **только** handler'ы. Никаких прямых repositories / domain-сервисов. См. **R08** и **R14** UC-10.
