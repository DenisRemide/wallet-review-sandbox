# wallet-sandbox — guidance for AI agents & reviewers

This repository is **spec-first**: code is checked against explicit specifications.
The rules below are the source of truth for architecture and code style. Any
reviewer — human or AI — must read them and flag any diff that violates them.

## Rules (normative)

All rules live in [`.claude/rules/`](.claude/rules/) (R01–R15). Read
[`.claude/rules/README.md`](.claude/rules/README.md) and
[`.claude/rules/manifest.yaml`](.claude/rules/manifest.yaml) first — the manifest
maps each file type to the specs that apply to it and assigns scoring weights.

| # | File | What it governs |
|---|---|---|
| R01 | [01-architecture.md](.claude/rules/01-architecture.md) | Layers, bounded contexts, module structure |
| R02 | [02-result-and-errors.md](.claude/rules/02-result-and-errors.md) | `Result<T,E>`, error-code taxonomy, **no `throw` in business logic** |
| R03 | [03-use-cases-and-handlers.md](.claude/rules/03-use-cases-and-handlers.md) | `UseCaseHandler`, one handler per operation |
| R04 | [04-repositories-and-persistence.md](.claude/rules/04-repositories-and-persistence.md) | Repository pattern, error-per-method |
| R05 | [05-transactions-and-locks.md](.claude/rules/05-transactions-and-locks.md) | Transactions, locks, **idempotency for non-idempotent ops** |
| R07 | [07-encryption-and-secrets.md](.claude/rules/07-encryption-and-secrets.md) | Envelope encryption, **no hardcoded secrets, no secrets in logs** |
| R08 | [08-api-and-dto.md](.claude/rules/08-api-and-dto.md) | Controllers → presentation-service → handler, DTO validation |
| R10 | [10-code-style.md](.claude/rules/10-code-style.md) | TypeScript strict, naming, no `any`, no `console.*`, no dead code |
| R11 | [11-state-machines.md](.claude/rules/11-state-machines.md) | Explicit FSM, validated status transitions |
| R13 | [13-dto-patterns.md](.claude/rules/13-dto-patterns.md) | DTO naming, validation, structure |
| R14 | [14-use-case-boundaries.md](.claude/rules/14-use-case-boundaries.md) | Handler as orchestration point, no infra leakage |
| R15 | [15-logging-and-observability.md](.claude/rules/15-logging-and-observability.md) | Event taxonomy, **redact PII/secrets**, no `console.*` |

## How to review a diff against these rules

1. Determine the file type of each changed file via `.claude/rules/manifest.yaml → file_types`.
2. Read the `applies` specs for that type.
3. Flag every violation, citing the rule id (e.g. "R02: `throw` in business logic").
4. Pay special attention to: errors-as-values (R02), idempotency + locks for
   money-moving operations (R05), no secrets/PII in logs (R07/R15), ownership /
   authorization checks, and decimal-safe money arithmetic.

## Reference implementations in this repo (rule-compliant)

- Handler: [`src/modules/wallet/use-case/credit-wallet/credit-wallet.handler.ts`](src/modules/wallet/use-case/credit-wallet/credit-wallet.handler.ts)
  — `Result`-returning, locked, idempotent, logs domain events.
- Repository: [`src/modules/wallet/infrastructure/repositories/wallet/wallet.repository.ts`](src/modules/wallet/infrastructure/repositories/wallet/wallet.repository.ts)
- Presentation: [`src/modules/wallet/presentation/`](src/modules/wallet/presentation/)

## Note on file:line references inside the rules

The rules were authored against a larger production codebase; the `file:line`
citations inside them point to that original code and are **illustrative**. The
normative content is the rule text and checklists, not the line numbers.
