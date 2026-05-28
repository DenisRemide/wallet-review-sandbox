# 13. DTO patterns

Этот файл — **детальная спецификация DTO** match-backend: naming, структура директорий, валидация, Swagger-аннотации, вложенность, compliance cards. Каждое правило — из реального кода, с file:line.

**Критичность:** compliance-package DTOs — сердце продукта (IVMS101, KYB/AML). Консистентность здесь важнее, чем где бы то ни было. Отклонения от этих правил блокируют merge.

## Область применения

- Регулирует: все файлы `*.dto.ts` в `src/modules/**/presentation/dto/`
- Не регулирует: DTO handler'ов (`Params`/`Result` типы рядом с `.handler.ts`) — это R03
- Комплиментарен к R08 (API structure) и R12 (общий voice)

## Эталонные файлы

| Тип DTO | Эталон |
|---|---|
| Простой Req + Res | `src/modules/auth/presentation/dto/sign-in.dto.ts` |
| Request с UUID + вложенным объектом | `src/modules/intent/presentation/compliance-package/dto/upload-originator-package.dto.ts` |
| Top-level агрегирующий DTO | `src/modules/intent/presentation/compliance-package/dto/compliance-package/compliance-package.dto.ts` |
| Card DTO (несколько массивов + enum + nested) | `src/modules/intent/presentation/compliance-package/dto/compliance-package/cards/company-card/company-card.dto.ts` |
| Component DTO (простой nested блок) | `src/modules/intent/presentation/compliance-package/dto/compliance-package/cards/company-card/components/company-card.name-identifier.dto.ts` |

---

## 1. Naming классов и файлов

### DTO-01: Request/Response — `<Action>DtoReq` / `<Action>DtoRes`
**Rule:** Классы запросов и ответов именуются с суффиксами `DtoReq` и `DtoRes`. Никакого `Request`/`Response`, никакого `DTO`/`Dto` в других позициях.
**Examples:**
- `SignInDtoReq`, `SignInDtoRes` — `src/modules/auth/presentation/dto/sign-in.dto.ts:10, 27`
- `UploadOriginatorPackageDtoReq` — `src/modules/intent/presentation/compliance-package/dto/upload-originator-package.dto.ts:7`
**Anti-pattern:** `SignInRequest`, `SignInResponseDTO`, `SignInResponseDto`.

### DTO-02: Nested/schema структуры — `<Name>SchemaDto`
**Rule:** Классы, которые не являются прямыми request/response, а описывают вложенные структуры (compliance cards, компоненты карт, агрегаты), именуются с суффиксом `SchemaDto`. Суффикс `Schema` — сигнал «это не endpoint DTO, это структура для вложения».
**Examples:**
- `CompliancePackageSchemaDto` — `compliance-package.dto.ts:8`
- `CompanyCardSchemaDto` — `cards/company-card/company-card.dto.ts:16`
- `CompanyCardNameIdentifierSchemaDto` — `cards/company-card/components/company-card.name-identifier.dto.ts:7`
- `UboCardSchemaDto` — `cards/ubo-card/ubo-card.dto.ts`
**Anti-pattern:** использование `DtoReq`/`DtoRes` для nested-структур, смешивание `Schema` и `Dto` в разных позициях суффикса.

### DTO-03: Имена файлов — `<kebab-name>.dto.ts`
**Rule:** Имя файла — `kebab-case` с суффиксом `.dto.ts`. Для component'ов внутри card'ы — `<card>.<component>.dto.ts`.
**Examples:**
- `sign-in.dto.ts`, `confirm-otp.dto.ts`, `activate-account.dto.ts`
- `company-card.dto.ts`, `company-card.name-identifier.dto.ts`, `company-card.geographic-address.dto.ts`
**Anti-pattern:** `SignInDto.ts`, `company_card.dto.ts`, `nameIdentifier.dto.ts` (без префикса карты).

### DTO-04: Компоненты карт имеют префикс карты в имени класса
**Rule:** Класс компонента, живущего внутри `company-card/components/`, начинается с `CompanyCard`. Внутри `ubo-card/components/` — с `UboCard`. Это дублирует структуру директорий в имени типа и предотвращает name collision при импорте.
**Examples:**
- `CompanyCardNameIdentifierSchemaDto` — `company-card.name-identifier.dto.ts:7`
- `UboCardNameIdentifierSchemaDto` — `ubo-card.name-identifier.dto.ts`
- `CompanyCardGeographicAddressSchemaDto`
- `CompanyCardNationalIdentificationSchemaDto`
**Anti-pattern:** `NameIdentifierSchemaDto` (без префикса), общий `NameIdentifier` для обеих карт.

### DTO-05: Компоненты **не шарятся** между картами, даже при одинаковой структуре
**Rule:** Если `name-identifier` у `CompanyCard` и `UboCard` одинаков по форме — **всё равно** создаются два отдельных класса в разных директориях. Общего `shared/name-identifier.dto.ts` быть не должно.
**Example:** `company-card/components/company-card.name-identifier.dto.ts` и `ubo-card/components/ubo-card.name-identifier.dto.ts` — параллельные файлы, несмотря на похожесть
**Why:** каждая карта — независимый контекст. При будущей дивергенции (например, UBO добавит `dateOfBirth` в name-identifier, а Company — нет) рефакторинг изолирован.
**Anti-pattern:** общий класс в `components/shared/` или `dto/shared/`.

---

## 2. Структура директорий

### DTO-06: Плоские DTO модуля живут в `presentation/dto/`
**Rule:** Простые request/response DTO для HTTP endpoint'ов — прямо в `modules/<name>/presentation/dto/<action>.dto.ts`.
**Example:** `src/modules/auth/presentation/dto/` — плоский список: `sign-in.dto.ts`, `confirm-otp.dto.ts`, `activate-account.dto.ts`, и т.д.
**Anti-pattern:** избыточные под-директории для простых DTO.

### DTO-07: Compliance-package DTOs — глубокая иерархия `cards/<card>/components/`
**Rule:** Compliance-package имеет **фиксированную** структуру директорий:
```
dto/
  upload-originator-package.dto.ts      # wrapper (top-level request)
  upload-beneficiary-package.dto.ts     # wrapper (top-level request)
  disbursement-instructions.dto.ts      # sibling schema
  compliance-package/
    compliance-package.dto.ts           # агрегирующий schema
    cards/
      company-card/
        company-card.dto.ts
        components/
          company-card.name-identifier.dto.ts
          company-card.geographic-address.dto.ts
          company-card.national-identification.dto.ts
      ubo-card/
        ubo-card.dto.ts
        components/
          ubo-card.name-identifier.dto.ts
          ubo-card.geographic-address.dto.ts
          ubo-card.national-identification.dto.ts
```
**Anti-pattern:** плоская структура для compliance cards, `components/` на одном уровне для разных карт, отсутствие уровня `cards/`.

### DTO-08: Wrapper DTOs (`upload-*`) живут **над** `compliance-package/`
**Rule:** `UploadOriginatorPackageDtoReq` и `UploadBeneficiaryPackageDtoReq` — в `dto/upload-*.dto.ts`, не внутри `dto/compliance-package/`. Агрегируют `CompliancePackageSchemaDto` и (для beneficiary) `DisbursementInstructionsSchemaDto`.
**Example:** `src/modules/intent/presentation/compliance-package/dto/upload-originator-package.dto.ts`
**Why:** wrapper — это endpoint-уровень, `compliance-package/` — это доменная структура.

---

## 3. Класс и поля

### DTO-09: Все поля — `readonly`
**Rule:** Каждое поле DTO помечено `readonly`. Это защищает от случайных мутаций после `plainToInstance`.
**Examples:** `company-card.dto.ts:34, 45, 54, 62`; `company-card.name-identifier.dto.ts:16, 24`
**Anti-pattern:** поле без `readonly`.

### DTO-10: Поля — `camelCase`, даже если в БД `snake_case`
**Rule:** На уровне DTO — `camelCase` (`legalPersonName`, `countryOfRegistration`, `nameIdentifiers`). Маппинг на snake_case — на уровне entity, не DTO.
**Examples:**
- `legalPersonName: string` — `company-card.name-identifier.dto.ts:16`
- `countryOfRegistration: string` — `company-card.dto.ts:62`
- `nameIdentifiers: CompanyCardNameIdentifierSchemaDto[]` — `company-card.dto.ts:34`
**Anti-pattern:** `legal_person_name`, `country_of_registration`.

### DTO-11: `implements Omit<DomainType, 'excluded'>` для связи с domain
**Rule:** Если DTO соответствует domain-типу, класс `implements Omit<DomainType, '<excluded fields>'>`. Исключаются поля, управляемые БД (`id`, `createdAt`, `updatedAt`) и ссылки (`*Id` на родителя).
**Examples:**
- `SignInDtoReq implements Omit<SignInParams, 'ip'>` — `sign-in.dto.ts:10` (исключает `ip` — берётся из request)
- `SignInDtoRes implements SignInResult` — `sign-in.dto.ts:27` (полное соответствие)
- `CompanyCardSchemaDto implements Omit<CompanyCard, 'id' | 'compliancePackageId' | 'nameIdentifiers' | 'geographicAddress' | 'nationalIdentification' | 'createdAt' | 'updatedAt'>` — `company-card.dto.ts:16-25` (исключены: db-поля + те, что в `Omit` потому что заменены на DTO-версию типа)
- `CompanyCardNameIdentifierSchemaDto implements Omit<CompanyCardNameIdentifier, 'id' | 'companyCardId' | 'createdAt' | 'updatedAt'>` — `company-card.name-identifier.dto.ts:7-10`
**Why:** компилятор падает, если domain-тип изменится, а DTO не обновится.
**Anti-pattern:** отсутствие `implements`; `implements DomainType` без `Omit` (тянет поля `id`, `createdAt`).

### DTO-12: Top-level агрегирующий DTO **не** имеет `implements`
**Rule:** `CompliancePackageSchemaDto` (`compliance-package.dto.ts:8`) не имеет `implements` — это чисто DTO-концепт, собирает вместе несколько card'ов для HTTP-контракта, не маппится 1-к-1 на один domain-тип.
**Example:** `compliance-package.dto.ts:8` — просто `export class CompliancePackageSchemaDto {`
**Anti-pattern:** попытка найти domain-тип `CompliancePackage` и маппить его.

### DTO-13: Один файл — один логический блок
**Rule:** В одном файле может быть **две сущности**, если это Request+Response одного endpoint'а (`SignInDtoReq` + `SignInDtoRes`). Для вложенных структур — **один класс на файл**.
**Examples:**
- `sign-in.dto.ts` — два класса (req + res) — `sign-in.dto.ts:1-34`
- `company-card.dto.ts` — один класс `CompanyCardSchemaDto`
- `company-card.name-identifier.dto.ts` — один класс
**Anti-pattern:** три разных Request DTO в одном файле; exporting вспомогательных types.

### DTO-14: **Не экспортировать** дополнительные type/interface из DTO-файла
**Rule:** DTO-файл содержит **только** `@ApiSchema`-классы. Никаких `export type X = ...`, `export interface Y`, утилит.
**Example:** `company-card.name-identifier.dto.ts` — только один export: класс.
**Anti-pattern:** `export type CompanyCardHelper = { ... }` рядом с классом.

---

## 4. Swagger-аннотации

### DTO-15: `@ApiSchema({ name })` на каждом классе
**Rule:** Каждый DTO-класс имеет `@ApiSchema({ name: '<Name>' })` непосредственно перед `export class`. Имя — без суффиксов `Dto`/`Schema`.
**Examples:**
- `@ApiSchema({ name: 'SignInRequest' })` — `sign-in.dto.ts:9`
- `@ApiSchema({ name: 'SignInResponse' })` — `sign-in.dto.ts:26`
- `@ApiSchema({ name: 'CompanyCard' })` — `company-card.dto.ts:15`
- `@ApiSchema({ name: 'CompanyCardNameIdentifier' })` — `company-card.name-identifier.dto.ts:6`
- `@ApiSchema({ name: 'CompliancePackage' })` — `compliance-package.dto.ts:7`
- `@ApiSchema({ name: 'UploadOriginatorPackageRequest' })` — `upload-originator-package.dto.ts:6`
**Anti-pattern:** `name: 'SignInDtoReq'`, `name: 'CompanyCardSchemaDto'`, отсутствие `@ApiSchema`.

### DTO-16: Naming rule для `@ApiSchema.name`
**Rule:**
- Для request: `<Action>Request`
- Для response: `<Action>Response`
- Для schema (nested): `<BusinessName>` (без суффикса), например `CompanyCard`, `UboCard`, `CompliancePackage`
- Для wrapper request: `<Action>Request`, например `UploadOriginatorPackageRequest`
**Anti-pattern:** несогласованность в naming — `Get` vs `Retrieve`, `Upload` vs `Submit`.

### DTO-17: `@ApiProperty` на каждом поле
**Rule:** **Каждое** поле DTO имеет `@ApiProperty({ ... })`. Без исключений. Отсутствие `@ApiProperty` — ошибка, не optimization.
**Examples:** все DTO файлы.
**Anti-pattern:** поле без `@ApiProperty`.

### DTO-18: `@ApiProperty` имеет `description` **и** `example` для примитивов
**Rule:** Для полей типа `string`, `number`, `boolean` — обязательны `description` (конкретное, специфичное к полю) и `example` (реалистичное).
**Examples:**
- `@ApiProperty({ example: 'user@example.com' })` — `sign-in.dto.ts:11` (short form — пример достаточен)
- `@ApiProperty({ description: 'Legal name of the company (LegalPerson).', example: 'PT Indo Trade' })` — `company-card.name-identifier.dto.ts:11-14`
- `@ApiProperty({ description: 'Country of registration (ISO 3166-1 alpha-2).', example: 'NL' })` — `company-card.dto.ts:56-59`
**Anti-pattern:** generic описания (`'field'`, `'the value'`), нереалистичные примеры (`'abc'`, `'test'`, `'string'`), отсутствие описания для complex полей.

### DTO-19: `@ApiProperty` для enum — `enum: EnumType, example: EnumType.VALUE`
**Rule:** Enum-поле: `@ApiProperty({ enum: XxxType, example: XxxType.SPECIFIC_VALUE })`. `example` — значение enum'а, не строка.
**Examples:**
- `@ApiProperty({ enum: AuthChallengeType, example: AuthChallengeType.EMAIL })` — `sign-in.dto.ts:31`
- `@ApiProperty({ description: 'Type of name identifier according to IVMS101.', enum: NameIdentifierType, example: NameIdentifierType.LEGL })` — `company-card.name-identifier.dto.ts:18-22`
**Anti-pattern:** `example: 'email'` (строка), отсутствие `enum:`.

### DTO-20: `@ApiProperty` для одиночного вложенного — `type: DtoClass`
**Rule:** `@ApiProperty({ description: '...', type: CompanyCardNationalIdentificationSchemaDto })`
**Example:** `company-card.dto.ts:47-51`
**Anti-pattern:** `type: 'object'`, отсутствие `type`.

### DTO-21: `@ApiProperty` для массива вложенных — `type: [DtoClass]` (массив с одним элементом)
**Rule:** `@ApiProperty({ description: '...', type: [CompanyCardNameIdentifierSchemaDto] })` — квадратные скобки вокруг класса.
**Examples:**
- `company-card.dto.ts:26-29` — `type: [CompanyCardNameIdentifierSchemaDto]`
- `compliance-package.dto.ts:17-20` — `type: [UboCardSchemaDto]`
**Anti-pattern:** `type: UboCardSchemaDto, isArray: true` (работает, но проект использует форму с `[]`).

### DTO-22: `@ApiProperty` для массива примитивов — `type: [String]` / `type: [Number]`
**Rule:** Массив строк/чисел — `type: [String]` (с заглавной, класс JS).
**Example:** `company-card.geographic-address.dto.ts:19-23` — `example: ['Jl. Sudirman No.52'], type: [String]`
**Anti-pattern:** `type: 'string[]'`, `type: [string]` (lowercase не работает).

### DTO-23: `@ApiPropertyOptional()` для опциональных полей
**Rule:** Для optional поля используется `@ApiPropertyOptional({ ... })` вместо `@ApiProperty({ required: false, ... })`. Первая форма предпочтительна.
**Example:** `disbursement-instructions.dto.ts:31` — `@ApiPropertyOptional()`
**Tolerated:** `@ApiProperty({ required: false })` — встречается, но новый код пишем с `@ApiPropertyOptional`.
**Anti-pattern:** обычный `@ApiProperty` на optional поле.

---

## 5. Валидация (class-validator)

### DTO-24: Валидатор обязателен на **каждом** поле
**Rule:** Нет полей без минимум одного декоратора валидации. Даже `readonly id: string` имеет `@IsUUID()` или `@IsString()`.
**Anti-pattern:** поле с `readonly`, но без валидатора.

### DTO-25: Порядок декораторов — `@IsOptional()` первый
**Rule:** Для optional полей `@IsOptional()` идёт **перед** type-валидатором.
**Example:**
```ts
@ApiPropertyOptional({ description: '...', example: '...' })
@IsOptional()
@IsString()
readonly swiftCode?: string;
```
— `disbursement-instructions.dto.ts:29-33`
**Anti-pattern:** `@IsString() → @IsOptional()`.

### DTO-26: Порядок валидаторов — от общего к специфичному
**Rule:** После `@IsOptional` (если есть) идёт тип (`@IsString`, `@IsNumber`, `@IsArray`), потом ограничения (`@MinLength`, `@Max`, `@Length`, `@Matches`).
**Example:** `sign-in.dto.ts:15-22`:
```ts
@ApiProperty({ example: 'strongPassword123', minLength: 8, maxLength: 128 })
@IsString()
@MinLength(8)
@MaxLength(128)
password: string;
```
**Anti-pattern:** `@MinLength(8) → @IsString()` (ограничение до типа).

### DTO-27: UUID — `@IsUUID()`, не `@IsString()`
**Rule:** UUID-поля используют `@IsUUID()`. Пример — `intentId`, `activationId`, `challengeId`.
**Examples:**
- `activate-account.dto.ts:14` — `@IsUUID()`
- `upload-originator-package.dto.ts:13` — `@IsUUID()`
**Anti-pattern:** `@IsString()` для UUID.

### DTO-28: Email — `@IsEmail()`, не `@IsString()`
**Rule:** Email-поля используют `@IsEmail()`.
**Example:** `sign-in.dto.ts:12`
**Anti-pattern:** `@IsString() + @Matches(/email regex/)`.

### DTO-29: ISO-коды стран — `@IsString() + @Length(2, 2)`
**Rule:** Для country codes по ISO 3166-1 alpha-2 — комбинация `@IsString()` и `@Length(2, 2)`. **Важно:** `@Length(2, 2)`, не `@MinLength(2) + @MaxLength(2)` — точная длина короче пишется через `Length`.
**Example:** `company-card.dto.ts:60-61` — `@IsString() @Length(2, 2)`
**Anti-pattern:** `@MinLength(2) + @MaxLength(2)`, только `@IsString()` без длины.

### DTO-30: Числовые поля с диапазоном — `@IsNumber() + @Min() + @Max()`
**Rule:** Все три декоратора. Без `@IsNumber()` — `@Min/@Max` не работают.
**Example:** UBO ownership percentage — `@IsNumber() @Min(0) @Max(100)`
**Anti-pattern:** только `@Min + @Max` без `@IsNumber`.

### DTO-31: Строки с контролируемой длиной — `@MinLength() + @MaxLength()`
**Rule:** Свободный текст (password, description, note) всегда имеет верхнюю границу. Нижняя — если есть бизнес-требование.
**Examples:**
- `sign-in.dto.ts:21-22` — password `@MinLength(8) @MaxLength(128)`
- `confirm-otp.dto.ts:20-22` — OTP code `@MinLength(6) @MaxLength(16)`
**Anti-pattern:** `@IsString()` без ограничения длины.

### DTO-32: Формат-specific — `@Matches(regex)`
**Rule:** Когда формат задан regex'ом (OTP `A-Za-z0-9`, IBAN, и т.д.) — `@Matches()` после `@MinLength/@MaxLength`.
**Example:** `confirm-otp.dto.ts` — `@Matches(/^[A-Za-z0-9]+$/)` для OTP
**Anti-pattern:** regex внутри `@IsString({ message })`.

### DTO-33: Enum — `@IsEnum(EnumType)`
**Rule:** `@IsEnum(PayoutMethod)`. Класс enum передаётся как тип, не строковые литералы union.
**Examples:**
- `sign-in.dto.ts:33` (внутри Res) — `type: AuthChallengeType`, но это response, валидации нет
- `company-card.name-identifier.dto.ts:23` — `@IsEnum(NameIdentifierType)`
**Anti-pattern:** union литералов `'bank_transfer' | 'swift'` вместо enum'а.

---

## 6. Вложенность

### DTO-34: Одиночный nested — `@ValidateNested() + @Type(() => Class)`
**Rule:** Для одного вложенного объекта: `@ValidateNested()` (без параметров) + `@Type(() => TargetDto)`. **Порядок** — валидатор сначала, `@Type` — второй.
**Example:** `company-card.dto.ts:52-54`:
```ts
@ValidateNested()
@Type(() => CompanyCardNationalIdentificationSchemaDto)
readonly nationalIdentification: CompanyCardNationalIdentificationSchemaDto;
```
**Anti-pattern:** `@Type` перед `@ValidateNested`, пропуск `@Type` (без него `plainToInstance` не превратит вложенный объект в класс).

### DTO-35: Массив nested — полная цепочка `@IsArray + @ArrayMinSize + @ValidateNested({ each: true }) + @Type`
**Rule:** Массив вложенных DTO требует **четырёх** декораторов в этом порядке:
```ts
@IsArray()
@ArrayMinSize(1)
@ValidateNested({ each: true })
@Type(() => ChildDtoClass)
readonly items: ChildDtoClass[];
```
**Examples:**
- `company-card.dto.ts:30-34` — `nameIdentifiers`
- `company-card.dto.ts:41-45` — `geographicAddress`
- `compliance-package.dto.ts:22-26` — `uboCards`
**Anti-pattern:** пропуск `@ValidateNested({ each: true })`, использование `@ValidateNested()` без `each`, пропуск `@Type`.

### DTO-36: `@ArrayMinSize(N)` обязателен для массивов с бизнес-требованием «непусто»
**Rule:** Compliance-card массивы (`nameIdentifiers`, `geographicAddress`, `uboCards`) всегда имеют `@ArrayMinSize(1)`. Пустой массив для них — **бизнес-ошибка**, не технически допустимое состояние.
**Examples:**
- `company-card.dto.ts:31` — `@ArrayMinSize(1)`
- `company-card.dto.ts:42` — `@ArrayMinSize(1)`
- `compliance-package.dto.ts:23` — `@ArrayMinSize(1)` (минимум один UBO)
**Anti-pattern:** допустимый пустой массив для обязательных компонентов.

### DTO-37: `@Type(() => Class)` — функция, **никогда** строка
**Rule:** `@Type(() => CompanyCardNameIdentifierSchemaDto)`. Функция, возвращающая класс.
**Examples:** все примеры выше
**Anti-pattern:** `@Type('CompanyCardNameIdentifierSchemaDto')`, `@Type(() => 'CompanyCardNameIdentifierSchemaDto')`.
**Why:** `@Type` со строкой в runtime не найдёт класс.

### DTO-38: Массивы примитивов — `@IsArray() + @IsString({ each: true })` без `@Type`
**Rule:** Для массива строк/чисел — `@IsArray() + @IsString({ each: true })`. `@Type` **не нужен**.
**Example:** `addressLines: string[]` в `geographic-address` — `@IsArray() @IsString({ each: true })`
**Anti-pattern:** `@Type(() => String)` для массива строк.

---

## 7. Трансформация входа

### DTO-39: `@Transform()` для нормализации (trim, lowercase)
**Rule:** Если входные данные требуют нормализации — `@Transform({ value } => value.trim())` из `class-transformer`. Нормализация делается **в DTO**, не в handler'е.
**Example:** `confirm-otp.dto.ts` — `@Transform(({ value }) => value.trim())` на OTP code
**Anti-pattern:** `.trim()` вызывается в handler'е после получения DTO.

### DTO-40: `@Transform` идёт **перед** декораторами валидации
**Rule:** Сначала трансформ (нормализация), потом валидация. Иначе validation увидит грязный input.
**Anti-pattern:** `@IsString() @Transform(...)` — порядок наоборот.

---

## 8. Импорты

### DTO-41: Порядок импортов — `@nestjs/swagger` → `class-validator` → `class-transformer` → domain
**Rule:** Четыре группы, каждая на своих строках, пустая строка между группами **необязательна** (в отличие от handler'ов — в DTO файлах импорты компактны).
**Example:** `company-card.name-identifier.dto.ts:1-4`:
```ts
import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { CompanyCardNameIdentifier } from '../../../.../company-card-name-identifier';
import { NameIdentifierType } from '../../../.../name-identifier-type';
```
**Example с `class-transformer`:** `company-card.dto.ts:1-13` — добавляется `import { Type } from 'class-transformer';` после `class-validator`.
**Anti-pattern:** `class-validator` перед `@nestjs/swagger`; domain перед библиотеками.

### DTO-42: Named imports, никогда default
**Rule:** `import { ApiProperty, ApiSchema } from '@nestjs/swagger';`
**Anti-pattern:** default imports.

### DTO-43: Относительные пути к domain-типам
**Rule:** Domain-типы импортируются относительными путями (`../../../../domain/...`), даже если глубина большая. Абсолютные `src/modules/<name>/domain/...` в DTO файлах не используется.
**Example:** `company-card.dto.ts:13` — `import { CompanyCard } from '../../../../../../domain/compliance-bundle/compliance-package/company-card/company-card';`
**Why:** DTO и domain живут в одном модуле — логическая связность важнее длины пути.

---

## 9. Structure и размер

### DTO-44: Один endpoint — один Request + один Response (или ничего)
**Rule:** Для каждого HTTP endpoint'а создаётся пара `<Action>DtoReq` / `<Action>DtoRes`. Если ответа нет (204) — только `DtoReq`. Если запрос пустой (GET) — только `DtoRes`.
**Example:** `sign-in.dto.ts` — `SignInDtoReq` + `SignInDtoRes`
**Anti-pattern:** переиспользование одного DTO для request **и** response.

### DTO-45: Нет реиспользования класса между Req и Res
**Rule:** Даже если поля совпадают — **два разных класса**. Req и Res живут в разных жизненных циклах (validation vs serialization), у них разные правила.
**Anti-pattern:** `SignInDto` используется и как input, и как output.

### DTO-46: Card DTO — **не больше** 5–7 top-level полей
**Rule:** Если у card DTO больше 7 полей, часть должна выноситься в компоненты. `CompanyCardSchemaDto` имеет 4 поля (`nameIdentifiers`, `geographicAddress`, `nationalIdentification`, `countryOfRegistration`) — в пределах нормы.
**Example:** `company-card.dto.ts` — 4 поля.
**Anti-pattern:** 15-польный монолит вместо декомпозиции на components.

### DTO-47: Компонент DTO — 1–4 поля
**Rule:** Component (внутри `components/`) — маленький, фокусированный. `CompanyCardNameIdentifierSchemaDto` — 2 поля (`legalPersonName`, `nameIdentifierType`). `CompanyCardGeographicAddressSchemaDto` — ~5 полей.
**Anti-pattern:** компонент с 10+ полями (значит, он тянет на отдельную card'у).

### DTO-48: Wrapper Request DTO — ровно 2–3 поля
**Rule:** `Upload*PackageDtoReq` содержит: 1) идентификатор (`intentId: string`), 2) доменную структуру (`compliancePackage: CompliancePackageSchemaDto`), опционально 3) дополнительный блок (`disbursementInstructions` для beneficiary).
**Examples:**
- `upload-originator-package.dto.ts:7-24` — `intentId + compliancePackage`
- `upload-beneficiary-package.dto.ts` — `intentId + compliancePackage + disbursementInstructions`
**Anti-pattern:** wrapper с 10 полями; дублирование полей `CompliancePackageSchemaDto` прямо в wrapper'е.

---

## 10. Domain-DTO mapping

### DTO-49: `Omit` в `implements` перечисляет **все** исключаемые поля
**Rule:** Список в `Omit<DomainType, 'a' | 'b' | 'c'>` — исчерпывающий. Должны быть исключены:
- `id` (PK, генерируется БД)
- `*Id` (FK на родителя, знается контекстуально)
- `createdAt`, `updatedAt` (timestamps)
- Nested domain-поля, которые заменяются на DTO-версию (потому что DTO принимает `CompanyCardNameIdentifierSchemaDto`, а domain имеет `CompanyCardNameIdentifier`)
**Example:** `company-card.dto.ts:16-25` — исключает 7 полей: `id | compliancePackageId | nameIdentifiers | geographicAddress | nationalIdentification | createdAt | updatedAt`
**Anti-pattern:** забыть исключить nested domain-поле — получишь type error.

### DTO-50: Schema DTO (не Req/Res) может **не** иметь `implements`
**Rule:** Top-level агрегирующие schemas, которые не соответствуют одному domain-типу, не имеют `implements`. Пример — `CompliancePackageSchemaDto` собирает `companyCard` + `uboCards`, но в domain нет одного типа `CompliancePackage`.
**Example:** `compliance-package.dto.ts:8` — `export class CompliancePackageSchemaDto {` (без `implements`)
**Anti-pattern:** создавать искусственный domain-тип только чтобы DTO получил `implements`.

---

## Чек-лист DTO (при создании нового)

### Именование
- [ ] Имя файла — `kebab-case.dto.ts`
- [ ] Имя класса — `<Action>DtoReq` / `<Action>DtoRes` / `<Name>SchemaDto`
- [ ] Для компонента внутри card'ы — префикс card'ы в имени класса и файла
- [ ] `@ApiSchema({ name })` — без суффиксов `Dto`/`Schema`

### Структура
- [ ] Один файл = один endpoint (req + res) ИЛИ одна nested структура
- [ ] Compliance cards — в `cards/<card>/` + `components/<card>.<comp>.dto.ts`
- [ ] Нет экспорта вспомогательных types/interfaces из DTO-файла
- [ ] Все поля `readonly`
- [ ] Поля в camelCase

### Domain-mapping
- [ ] Req/Res/card/component — имеет `implements Omit<Domain, 'excluded'>`
- [ ] Top-level агрегирующие schemas — **без** `implements`
- [ ] `Omit` список исчерпывающий: id, *Id, createdAt, updatedAt, replaced-by-dto nested

### Валидация
- [ ] `@ApiProperty` на каждом поле
- [ ] `@ApiProperty` имеет `description` и `example` для примитивов
- [ ] Enum-поля: `@ApiProperty({ enum, example: Enum.VALUE })`, `@IsEnum(Enum)`
- [ ] Каждое поле имеет валидатор (`@IsString`, `@IsNumber`, `@IsEmail`, `@IsUUID`, …)
- [ ] Порядок: `@ApiProperty` → `@IsOptional?` → type → constraints
- [ ] UUID — `@IsUUID()`, email — `@IsEmail()`, ISO code — `@Length(2, 2)`
- [ ] Строки с верхней границей — `@MinLength/@MaxLength`
- [ ] `@Transform` перед валидаторами (если нужна нормализация)

### Вложенность
- [ ] Одиночный nested: `@ValidateNested() + @Type(() => Class)`
- [ ] Массив nested: `@IsArray() + @ArrayMinSize(N) + @ValidateNested({ each: true }) + @Type(() => Class)`
- [ ] Массив примитивов: `@IsArray() + @IsString({ each: true })` (без `@Type`)
- [ ] `@Type` — функция `() => Class`, не строка
- [ ] `@ArrayMinSize(1)` на массивы с бизнес-требованием «непусто»

### Swagger
- [ ] `@ApiProperty({ type: DtoClass })` для одиночного nested
- [ ] `@ApiProperty({ type: [DtoClass] })` для массива nested
- [ ] `@ApiProperty({ type: [String] })` для массива примитивов
- [ ] `@ApiPropertyOptional()` для optional полей

### Размер
- [ ] Card DTO — не больше 5–7 top-level полей (иначе декомпозировать)
- [ ] Component DTO — 1–4 поля (иначе это не компонент)
- [ ] Wrapper Request — ровно 2–3 поля (id + domain structure + опц.)

## Процедура создания нового DTO

1. **Определи тип**: endpoint (req+res), card, component, wrapper.
2. **Открой эталон** из таблицы в начале.
3. **Скопируй структуру** буквально: импорты, `@ApiSchema`, `@ApiProperty`, порядок декораторов.
4. **Добавь `implements Omit`** от соответствующего domain-типа (кроме top-level агрегирующих).
5. **Пройди по чек-листу** выше.
6. **Запусти `/spec-check <path>`** для верификации.

## Конфликт с R08

`08-api-and-dto.md` описывает presentation-слой в целом (controller + presentation-service + DTO). Там есть общие DTO-правила. При конфликте между R08 и R13 — **побеждает R13**, потому что он специфичнее и написан из глубокого анализа реальных compliance-DTOs.
