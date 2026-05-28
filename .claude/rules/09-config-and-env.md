# 09. Конфиг и env

## Принцип: fail-fast на старте

Приложение **не стартует** с невалидным конфигом. Все env-переменные валидируются при загрузке модуля. Если переменная обязательна и отсутствует — exception на старте, процесс падает.

## Инструмент: `validateEnv`

`src/lib/class-validator/validate-env.ts:7-20`:

```ts
export const validateEnv = <T extends object>(
  config: new (...args: any[]) => T,
): T => {
  const validatedConfig = plainToInstance(config, process.env, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });
  if (errors.length > 0) throw new Error(errors.toString());
  return validatedConfig;
};
```

## Структура конфиг-класса

Для каждого infrastructure-модуля — свой config-класс в `*.config.ts`:

- `src/infrastructure/db/db.config.ts` — `DbConfig`;
- `src/infrastructure/redis/redis.config.ts` — `RedisConfig`;
- `src/infrastructure/rabbitmq/rabbitmq.config.ts` — `RabbitmqConfig`;
- `src/infrastructure/smtp/smtp.config.ts` — `SmtpConfig`;
- `src/modules/encryption/infrastructure/kms/kms.config.ts` — `KmsConfig`;
- `src/modules/auth/infrastructure/jwt/jwt.config.ts` — `JwtConfig`.

### Правила

1. **Один модуль — один config-класс.** Общего `AppConfig` нет, каждый модуль декларирует свои переменные.
2. **Поля класса — это env-переменные.** Имена в `SCREAMING_SNAKE_CASE`, **идентичны** именам в `process.env` и во всех точках развёртывания (см. правило консистентности ниже).
3. **Валидаторы обязательны на каждом поле:** `@IsString()`, `@IsNumber()`, `@IsBoolean()`, `@IsUrl()`, `@IsEnum(...)`, `@IsInt()`, `@Min()`, `@Max()`, `@IsOptional()`.
4. **Опциональные переменные помечаются `@IsOptional()`.** Иначе — обязательные, падаем если пусто.
5. **Тип в коде соответствует реальному типу значения.** `PORT: number`, не `string`.
6. **Никакого `process.env.FOO` в бизнес-коде.** Только инжект config-класса.

## Регистрация конфига в модуле

Эталон подхода: модуль вызывает `validateEnv(XxxConfig)` при регистрации провайдера и инжектит инстанс через DI-токен или класс.

```ts
@Module({
  providers: [
    {
      provide: DbConfig,
      useFactory: () => validateEnv(DbConfig),
    },
    ...
  ],
  exports: [DbConfig],
})
```

## Правило консистентности

При добавлении / переименовании / удалении env-переменной — обязательно обновить **все** точки внутри репозитория:

1. Config-класс с валидаторами в `src/**/*.config.ts`
2. Локальный `.env.example` (плейсхолдерное значение, чтобы было видно из чего стартовать)
3. `README.md` или другая документация, если переменная там упомянута

Имя переменной — `SCREAMING_SNAKE_CASE`, **идентично** во всех точках. Внешние системы развёртывания (Docker compose, Kubernetes, CI/CD secrets) — за пределами этой спеки; их синхронизация делается отдельно при выкатке.

## Секреты vs конфиг

- **Секреты** (пароли, JWT-ключи, KMS ARN, AWS credentials) — передаются через env-переменные. Локально лежат в `.env`, который **никогда** не коммитится. В продакшене — через секрет-механизм деплоя (k8s Secret, vault, и т.п.).
- **Конфиг** (URLs, порты, feature flags, timeouts) — тоже env-переменные, но без секретности.
- Оба грузятся одинаково через `validateEnv`. Различие — только на уровне storage и прав доступа за пределами процесса.
- В `.env.example` секреты обозначены плейсхолдером (`<your-key-here>`), не реальным значением.

## Чек-лист новой env-переменной

- [ ] Добавлена в соответствующий `*.config.ts` с validator decorator
- [ ] Тип соответствует реальному (`number`, `boolean`, `string`, enum)
- [ ] Если обязательная — без `@IsOptional()`
- [ ] Если секрет — задокументирована как секрет, не попадает в примеры/скриншоты
- [ ] Имя идентично во всех точках внутри репозитория
- [ ] Добавлена в `.env.example`
- [ ] Не используется через `process.env.*` в бизнес-коде — только через инжект config-класса
