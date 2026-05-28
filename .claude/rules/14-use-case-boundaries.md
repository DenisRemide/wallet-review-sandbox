# 14. Use-case boundaries — ответственность слоя

## Зачем этот файл

R01 описывает **границы между модулями** (bounded contexts, external-services). R03 описывает **форму** handler'а (интерфейс `UseCaseHandler`, возвращаемый `Result`, sub-handlers). Ни то, ни другое не задаёт **содержание** handler'а — что именно ему положено делать внутри `run()`.

Эта дыра даёт handler'ам разрастаться в god-объекты: они инжектят десяток репозиториев, знают форму raw-row БД, оркеструют шифрование вручную, хранят доменные парсеры как utility-функции рядом. Формально все остальные правила соблюдены — practically use-case превратился в infrastructure service. Этот файл закрывает дыру явными правилами.

## Принцип

**Use-case — точка сборки, не имплементации.** Handler оркеструет бизнес-операцию через вызовы repositories, domain-сервисов и sub-handlers. Он **не знает** инфраструктурных подробностей (форма DB-row, envelope-encryption, crypto-буферы), **не парсит** доменные структуры из raw-JSON, **не размазывает** запись по множеству таблиц сам.

Если handler это делает — в кодобазе **не хватает domain-сервиса**, и handler заполняет вакуум.

---

## Правила

### UC-01: Handler инжектит **не более 5 зависимостей**

**Rule:** Конструктор handler'а имеет **максимум 5** `private readonly` зависимостей. 6+ — сигнал, что операция уровнем ниже, чем бизнес-use-case: это scatter-gather или infrastructure orchestration, и внутри должен быть выделен domain-сервис, который handler вызывает одним методом.
**Example (ok):** `SignInHandler` — 9 зависимостей, но из них 3 — sub-handlers (`SignInEmailHandler`, `SignInTotpHandler`, `ResolvePendingChallengeHandler`), 2 — infrastructure-сервисы общего назначения (`RedlockService`, `RateLimitService`, `HashService`), 1 — external-service (`UserExternalService`), 2 — repositories (`AuthUserProfileRepository`, `AuthChallengeRepository`). Итого: 3 repo/external + 3 sub-handler + 3 infra = высокая композиция, тонкая оркестрация. Это допускается потому что **каждая зависимость — одна фаза run()**, не deep-implementation.
**Anti-pattern:** handler инжектит 12 repositories и сам перекладывает данные из draft в 8 таблиц (`admin-approve-partner-onboarding.handler.ts` исторически). Правильно — один инжект `PartnerComplianceScatterService` с методом `scatterDraftIntoComplianceProfile(draftId)`.
**Когда превышать порог:** только если все дополнительные инжекты — infrastructure-сервисы общего назначения (`Logger`, `RedlockService`) или sub-handlers. Порог 5 — для **бизнес-зависимостей** (repositories, external-services, domain-сервисы).

### UC-02: Handler не знает форму raw-row БД

**Rule:** Типы в параметрах и внутренних переменных handler'а не содержат названий колонок с техническими суффиксами (`_enc`, `_hash`, `_dek`, `_aad`), не принимают `Buffer` напрямую, не знают о discriminator-флагах persistence-слоя.
**Example (anti-pattern):**
```ts
private async buildScatterPayload(
  draftRow: {
    complianceSensitiveFieldsEnc: Buffer | null;  // ← утечка формы БД
    dek: Buffer | null;                            // ← инфраструктурный тип
    aad: { schemaVersion: number } | null;         // ← envelope detail
    compliancePublicFields: Record<string, unknown>;
  },
  ...
)
```
**Why:** репозиторий обязан возвращать **domain-тип** (R04 §5). Если handler видит `Buffer`, `dek`, `enc` — значит repository не сделал свою работу, а handler выполняет маппинг entity→domain вручную. Починка — репозиторий возвращает `PartnerOnboardingDraftBundle` с уже дешифрованными полями (через composition с `PartnerDraftBundleService`).
**Правильный контракт:**
```ts
type PartnerOnboardingDraftBundle = {
  id: string;
  profileId: string;
  compliancePublicFields: CompliancePublicFields;
  complianceSensitiveFields: ComplianceSensitiveFields;  // plaintext
  companyCard: CompanyCard;
  uboCards: UboCard[];
  updatedAt: Date;
};
```

### UC-03: Handler не оркеструет envelope-encryption вручную

**Rule:** Handler не вызывает последовательность «вытащить DEK → дешифровать → сериализовать → зашифровать обратно» напрямую. Envelope-encryption — infrastructure-подробность. Эта оркестрация живёт либо в repository (который возвращает уже дешифрованный domain-тип), либо в выделенном domain-сервисе (`<Aggregate>BundleService` с методами `loadDecrypted` / `saveEncrypted`).
**Example (anti-pattern):** `decryptExistingBundle` как `private async` метод в `apply-extraction-result.handler.ts:165` и `update-onboarding-draft.handler.ts:134` — одинаковый код в двух местах, оркеструет `ExternalEncryptionService.envelopeDecrypt(encField, dek, aad)`.
**Правильное место:** `PartnerDraftBundleService.loadDecrypted(profileId)` возвращает `PartnerOnboardingDraftBundle` (см. UC-02).
**Why:** handler'у положено оперировать plaintext domain-объектами; шифрование — это «как» они хранятся, а не «что» с ними делают.

### UC-04: Handler не держит доменные парсеры рядом

**Rule:** Utility-файл рядом с handler'ом (`*.utilities.ts`) содержит либо type guards (R12 CV-84/85), либо узко-технические мапперы от repository к domain (shape-парсинг raw-row). Доменная семантика — «как интерпретировать это поле, что означает значение X» — живёт в `modules/<name>/domain/`, не в use-case-слое.
**Anti-pattern:** `admin-approve-partner-onboarding.utilities.ts` экспортирует `parseDraftLicenseStatus`, `parseDraftBoolean`, `hasAnyField`, `asStringArray`, `asStringOrNull` — это доменные интерпретаторы (что такое «boolean в draft'е», какой набор значений у license status'а). Их место — в `domain/partner-compliance-profile/` как методы соответствующих классов или чистые domain-функции, а handler импортирует их **оттуда**.
**Rule of thumb:** если функция знает бизнес-правило (списки допустимых значений, семантику поля) — это domain. Если знает только технический shape (как вытащить `string` из `unknown` безопасно) — это lib/типовая утилита.

### UC-05: Cross-table orchestration — это domain-сервис, не handler

**Rule:** Если `run()` выполняет атомарную операцию над >3 таблицами (чтение + запись), эта операция выделяется в **domain-сервис** модуля. Handler инжектит сервис и делает один вызов.
**Example pattern:**
```ts
// domain/partner-compliance-profile/partner-compliance-scatter.service.ts
@Injectable()
export class PartnerComplianceScatterService {
  async scatterDraftIntoComplianceProfile(
    draftId: string,
  ): Promise<Result<void, ScatterErrorCode>> { ... }
}

// use-case/onboarding/admin-approve-partner-onboarding/admin-approve-partner-onboarding.handler.ts
async run(params): Promise<Result<void, ErrorCode>> {
  const scatterResult = await this.scatterService.scatterDraftIntoComplianceProfile(
    params.draftId,
  );
  if (scatterResult.isErr()) return err(scatterResult.error);

  const transitionResult = await this.onboardingProfileRepository.updateStatus(
    params.onboardingProfileId,
    PartnerOnboardingStatus.ACTIVE,
  );
  if (transitionResult.isErr()) return err(transitionResult.error);

  return ok();
}
```
**Anti-pattern:** handler с 12 инжектами, ручным перекладыванием данных в 8 таблиц (`admin-approve-partner-onboarding.handler.ts` в первоначальном виде — 830 строк, 13 private async методов).
**Why:** handler должен читаться как **сюжет бизнес-операции**, а не как реализация. «Approve onboarding» — это «разложи draft по compliance-картам + переведи статус в ACTIVE + опубликуй событие». Три строки вызова. Детали «как раскладывается» — ответственность domain-сервиса.

### UC-06: Error codes use-case'а не упоминают persistence-операции

**Rule:** Suffix-каталог R02 разрешает `_DB_ERROR` / `_TX_ERROR` для технических ошибок. Но **middle-namespace** error code'а use-case'а не должен быть SQL-операцией (`_UPSERT_`, `_SCATTER_`, `_SELECT_`, `_DELETE_`). Middle-namespace — это **фаза бизнес-операции** (`FIND_ACTIVATION`, `SET_ACTIVATED`, `VERIFY_PASSWORD`), а не название репо-метода.
**Example (anti-pattern):**
```ts
export type AdminApprovePartnerOnboardingErrorCode =
  | 'ADMIN_APPROVE_SCATTER_UPSERT_DB_ERROR'          // ← UPSERT = SQL
  | 'ADMIN_APPROVE_SCATTER_DRAFT_DELETE_DB_ERROR'    // ← DELETE = SQL
  | ...
```
**Example (ok):**
```ts
export type AdminApproveOnboardingErrorCode =
  | 'ADMIN_APPROVE_ONBOARDING_SCATTER_FAILED'        // фаза
  | 'ADMIN_APPROVE_ONBOARDING_TRANSITION_FAILED'     // фаза
  | 'ADMIN_APPROVE_ONBOARDING_TX_ERROR'              // инфра
  | ...
```
**Why:** error code'ы попадают во frontend (через R08 маппинг), в логи, в дашборды. SQL-лексика в имени бизнес-ошибки течёт в places, которые не должны знать про SQL вообще.

### UC-07: Декомпозиция — sub-handler ИЛИ domain-сервис, в зависимости от характера

**Rule:** Когда `run()` вырастает за CV-20 (~200 строк), есть два пути декомпозиции, и выбор **не произвольный**:
- **Sub-handler** — когда шаг является **самостоятельной бизнес-операцией** с отдельными входом/выходом/ошибками, может быть переиспользован или вызван по отдельному event'у. Пример: `SignInEmailHandler`, `SignInTotpHandler` — каждый сам по себе полноценный use-case, просто выбираемый стратегией.
- **Domain-сервис** — когда шаг является **инфраструктурно-доменной подробностью**, у него нет независимой бизнес-ценности, он существует только как внутренность операции. Пример: `scatterDraftIntoComplianceProfile` — не бывает use-case «разложить draft без одобрения», это всегда часть approve'а.

**Эвристика:** если шаг можно натурально назвать именем handler'а с суффиксом `Handler` и его могут вызвать независимо — sub-handler. Если шаг — это **как** что-то делается, а не **что** делается — domain-сервис.

**Anti-pattern:** 15 private async методов в одном handler'е. Это **всегда** один из двух кейсов выше, не подумав.

### UC-08: Handler не импортирует `Buffer`, `crypto`, `fs`, TypeORM-типы напрямую

**Rule:** Следующие импорты в `*.handler.ts` — запрещены:
- `import { Buffer } from 'buffer'` или использование `Buffer` в сигнатурах/телах методов
- `import { createHash, randomBytes, ... } from 'crypto'`
- `import ... from 'fs'` / `fs/promises`
- `import { QueryRunner, EntityManager, SelectQueryBuilder, ... } from 'typeorm'`
- `import { Repository } from 'typeorm'` (кроме случая, когда handler сам **является** репозиторием — такого не бывает)

**Why:** эти типы — маркеры инфраструктурного уровня. Их присутствие в handler означает, что handler делает работу слоя ниже.
**Exception:** `Buffer` допустим в сигнатурах параметров handler'а, когда операция **семантически** принимает бинарные данные (например, `UploadPartnerDocumentsHandler` принимает file buffer'ы). В этом случае `Buffer` — часть **бизнес-контракта** (upload file), а не утечка persistence.

### UC-09: Handler не оперирует `Record<string, unknown>` в типах Params/Result

**Rule:** Параметры и результат handler'а типизированы **доменными** типами. `Record<string, unknown>` / `any` / `unknown`-поля в `<Handler>Params` / `<Handler>Result` — признак того, что handler не определился, над **чем** он работает.
**Anti-pattern:** `AdminApproveParams { draftRow: { compliancePublicFields: Record<string, unknown> } }` — handler по сути принимает «что-то из БД, разберись сам».
**Правильно:** `AdminApproveParams { onboardingProfileId: string }` — handler знает только идентификатор, достаёт нужное через domain-сервис, который уже знает, что оно такое.
**Exception:** external-integration handler'ы (вызовы в extractor, KMS, SMTP) могут иметь `unknown` в **теле** для payload сторонних систем — но с немедленным сужением через type guards до типизированных domain-структур (`ExtractorService.getDocumentJob` — канонический пример).

### UC-10: Presentation-service вызывает **только** handler'ы

**Rule:** Усиление CV-43. Presentation-service инжектит handler'ы (и, опционально, узкоспециальные utilities типа `extractIp`). **Не** инжектит repositories, domain-сервисы, external-сервисы, infrastructure.
**Anti-pattern:** `partner-onboarding-presentation.service.ts` инжектит `PartnerOnboardingDraftRepository` и зовёт `findByProfileId` напрямую в `getOnboardingState`. Должен быть handler (`GetPartnerOnboardingStateHandler`), который возвращает всё нужное в одном Result.
**Why:** presentation-service — тонкий маппер между HTTP и use-case. Если ему понадобился data-access минуя handler — значит handler не возвращает то, что нужно: чините handler, не добавляйте bypass.

### UC-11: Handler не имеет побочных эффектов за рамками БД и outbox

**Rule:** Внутри `run()` не делаются:
- HTTP-вызовы во внешние системы (используй external-service / infrastructure-сервис, обёрнутый в sub-handler'е)
- отправка email напрямую (SMTP — через infrastructure-service, вызываемый из **отдельного** handler'а-effect'а, который дёргается по outbox-event'у, а не inline)
- запись в файловую систему
- Запросы к кэшу ради бизнес-решения (кэш — исключительно infrastructure-оптимизация)

**Допустимые побочные эффекты в транзакции run():**
- чтение/запись БД через repositories
- чтение/запись outbox-сообщений через `OutboxService.createMessage`
- взятие locks (Redlock, advisory lock) через соответствующие сервисы
- rate-limiting (token bucket, timed queue) через `RateLimitService`

**Example (anti-pattern):** handler делает `await this.smtpService.sendEmail(...)` внутри транзакции. Правильно — в транзакции создать outbox-сообщение, а отправку обработать в consumer'е на другой стороне шины.

---

## Типичные «запахи» use-case'а, которые требуют refactor'а

Чек-лист для ревью. Если хотя бы три из этих признаков совпали — handler требует декомпозиции:

- [ ] Конструктор принимает 6+ repositories / external-services / domain-сервисов
- [ ] `run()` длиннее 150 строк
- [ ] Есть 2+ `private async` метода
- [ ] Хотя бы один параметр / локальный тип содержит `Buffer`, `Record<string, unknown>`, или название поля с суффиксом `_enc` / `_hash`
- [ ] Handler напрямую импортирует `crypto`, `Buffer`, `fs`, TypeORM-типы (кроме Result/DTO)
- [ ] Рядом с `*.handler.ts` лежит `*.utilities.ts` с функциями, которые знают бизнес-правила (списки допустимых значений, доменные парсеры)
- [ ] Error codes содержат лексику SQL-операций (`UPSERT`, `SCATTER`, `DELETE`, `SELECT` в middle-namespace)
- [ ] Handler реализует шифрование / дешифрование последовательностью вызовов `envelopeDecrypt` → `parse` → `envelopeEncrypt`

## Где хранить выделенный код

- **Domain-сервисы модуля** — `modules/<name>/domain/services/<name>.service.ts`. Инжектируются через соответствующий `domain.module.ts`, экспортируются для use-case'ов того же модуля.
- **Pure domain-функции** (парсеры без состояния, value-object construction, бизнес-валидации) — `modules/<name>/domain/<aggregate>/*.ts` рядом с типом, как методы класса / статические функции.
- **Cross-aggregate domain-сервисы** (которые работают сразу с compliance-profile, partner и onboarding) — `modules/<name>/domain/services/<operation>.service.ts`, когда bounded context один; если bounded context'ов несколько — через `external-service` того, кому операция логически принадлежит.

## Связь с другими правилами

- **R01** — bounded contexts. UC-05 / UC-10 усиливают границы модуля: scatter-операция не должна течь между модулями через прямые repository-импорты.
- **R03** — форма handler'а. R14 — содержание handler'а. R03 говорит «handler реализует `UseCaseHandler<Params, Result>`», R14 говорит «…и внутри ничего лишнего».
- **R04** — repository возвращает domain-тип. UC-02 усиливает: handler обязан *полагаться* на это, а не компенсировать отсутствие маппинга в своём коде.
- **R11** — FSM. UC-05 применяется в том числе к FSM-операциям: одна `updateStatus` транзакция + outbox-event — это хорошо. А «размазать данные по 8 таблицам + updateStatus» — это два разных use-case'а, соединённых saga / outer transaction, не один толстый handler.

## Чек-лист при ревью handler'а

- [ ] Конструктор ≤ 5 бизнес-зависимостей (repositories, external-services, domain-сервисы)
- [ ] `run()` ≤ 200 строк, в пределах CV-20
- [ ] 0 private async методов ИЛИ они тривиальны (guard clauses, простые распаковки)
- [ ] Params/Result типы — доменные, без `Buffer`/`Record<string, unknown>`
- [ ] Нет прямых импортов `Buffer`, `crypto`, `fs`, TypeORM-типов
- [ ] Нет `*.utilities.ts` с доменным знанием — только type guards и узкие shape-мапперы
- [ ] Error codes не упоминают SQL-операции в middle-namespace
- [ ] Нет ручной оркестрации envelope-encryption
- [ ] Scatter-операции (>3 таблицы) вынесены в domain-сервис
- [ ] Presentation-service, вызывающий этот handler, не обходит его через repository

## Процедура при обнаружении нарушения

1. Определи тип нарушения по правилам UC-01..UC-11.
2. Оцени кандидата на выделение — sub-handler или domain-сервис (UC-07).
3. Прочитай эталон соответствующего паттерна:
   - Тонкий handler-композитор: `src/modules/user/use-case/create-user/create-user.handler.ts`
   - Handler-стратегия с sub-handlers: `src/modules/auth/use-case/presentation/sign-in/sign-in.handler.ts`
   - Domain-сервис эталона пока нет в кодбазе — создаваемый как первый должен стать reference'ом.
4. Сделай refactor в **отдельном** PR, не смешивая с feature-работой.
