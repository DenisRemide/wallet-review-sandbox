# 07. Шифрование и секреты

## Envelope encryption

Весь чувствительный PII / compliance-данные шифруются **envelope-паттерном**:

1. Для каждой записи генерируется свой **Data Encryption Key (DEK)** — случайные 32 байта.
2. DEK шифруется **Key Encryption Key (KEK)**, хранящимся в AWS KMS.
3. В БД записываются:
   - `<field> bytea` — зашифрованные данные;
   - `dek bytea` — зашифрованный DEK;
   - `aad json` — Additional Authenticated Data (контекст, привязывающий ciphertext к записи).

Никаких «зашифруем одним ключом из .env». Никогда.

## Инструменты

| Операция | Handler |
|---|---|
| Шифрование одной записи | `EnvelopeEncryptHandler` (`src/modules/encryption/use-case/envelope-encrypt/envelope-encrypt.handler.ts`) |
| Дешифрование одной записи | `EnvelopeDecryptHandler` (`.../envelope-decrypt/`) |
| Batch-шифрование | `EnvelopeEncryptManyHandler` (`.../envelope-encrypt-many/`) |
| Batch-дешифрование | `EnvelopeDecryptManyHandler` (`.../envelope-decrypt-many/`) |

Low-level — `EncryptionService` (`src/modules/encryption/infrastructure/encryption/encryption.service.ts`) и `KmsService` (`src/modules/encryption/infrastructure/kms/kms.service.ts`). Использовать их напрямую из бизнес-кода **запрещено** — только через handler'ы или `ExternalEncryptionService`.

## Правило: только `FlatAAD`

AAD — плоский объект из примитивов. Определение — `encryption.service.ts:26`:

```ts
export type FlatAAD = Record<string, string | number | boolean | null>;
```

Почему:
- AES-GCM требует байтовой идентичности AAD при encrypt/decrypt;
- вложенные объекты / массивы — недетерминированная сериализация;
- `normalizeAAD` сортирует ключи и сериализует через `JSON.stringify(obj, sortedKeys)` — `encryption.service.ts:261-302`.

**Нельзя**:
- класть объекты / массивы в AAD;
- класть timestamp/random — AAD должен быть воспроизводимым при decrypt;
- менять ключи AAD после записи — поле станет нечитаемым.

**Нужно**:
- класть контекст, привязывающий ciphertext к записи: `partnerId`, `userId`, `tenantId`, `fieldName`, `schemaVersion`.
- хранить использованный AAD в колонке `aad json` рядом с ciphertext, чтобы decrypt мог воспроизвести.

## Правило: low-level `EncryptionService` не вызывается из бизнес-кода

Handler'ы бизнес-модулей используют `ExternalEncryptionService` (`src/modules/encryption/external/external-encryption.service.ts`), который прокидывает вызовы в use-case handler'ы. Прямой импорт `EncryptionService` / `KmsService` в `modules/partner/`, `modules/intent/` и т.д. — **нарушение**.

## Константы AES-GCM

Захардкожены в `EncryptionService` (`encryption.service.ts:78-81`):

- алгоритм — `aes-256-gcm`;
- IV — 12 байт (случайный каждый encrypt);
- auth tag — 16 байт;
- key — 32 байта.

Формат ciphertext в `bytea`: `[IV | ciphertext | authTag]`. Формат не меняется без миграции данных.

## Секреты и конфиги

- **Все секреты** — через env-переменные, валидируются на старте (см. `09-config-and-env.md`).
- JWT-ключ: сейчас HS256 симметричный (`app.module.ts:14-18`). Для production-grade микросервисной архитектуры — мигрировать на RS256 с ключами из KMS/Vault. Это tracked item для спецификации, не текущий code-rule.
- `.env` файлы **никогда** не коммитятся. `.env.sample` с пустыми значениями — да.
- Секреты в kubernetes — через `Secret` ресурсы, не через `ConfigMap`. См. INFRASTRUCTURE.md проекта.
- Логи **никогда** не содержат секретов, JWT-токенов, ciphertext'ов. При логировании объектов — whitelist полей, не blacklist.

## Чек-лист шифрования (новое поле)

- [ ] Колонка в таблице — `bytea`
- [ ] В той же таблице есть `dek bytea NOT NULL` и `aad json NOT NULL` (один на запись — не на поле)
- [ ] Шифрование/дешифрование проходит через `EnvelopeEncrypt*Handler` / `EnvelopeDecrypt*Handler`
- [ ] AAD — `FlatAAD`, содержит стабильный контекст (id записи, тип, version)
- [ ] AAD сохраняется рядом с ciphertext
- [ ] Нет прямого импорта `EncryptionService` / `KmsService` из бизнес-модуля
- [ ] Ключ / DEK / расшифрованные данные не попадают в логи
- [ ] Schema version заложен в AAD — для будущей ротации формата

## Чек-лист секретов

- [ ] Нет хардкода секретов в коде или тестах
- [ ] Новая env-переменная добавлена в конфиг-класс с `@IsString()` / `@IsNumber()` / etc.
- [ ] Кросс-слойная консистентность проверена (см. R09 → «Правило консистентности»)
- [ ] Логи не содержат значений секретных переменных
