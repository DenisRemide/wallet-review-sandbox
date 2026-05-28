# AGENTS.md

This repository is spec-first. The normative rules for architecture and code
style live in [`.claude/rules/`](.claude/rules/) (R01–R15). Before writing or
reviewing code, read [`CLAUDE.md`](CLAUDE.md) and the relevant rule files.

Key invariants reviewers must enforce:

- **R02** — errors are values (`neverthrow` `Result<T,E>`); no `throw` in
  handlers/repositories/domain/infrastructure. Error codes follow the
  `<OPERATION>_<SUB-NAMESPACE>_<REASON>` taxonomy; no bare `ERROR`/`FAILED`.
- **R05** — non-idempotent, money-moving operations run under a lock and honour
  the caller's idempotency key.
- **R07 / R15** — no hardcoded secrets; never log secrets, API keys, or PII.
- **R08** — controllers call a presentation-service, which calls the handler;
  DTOs validate all input.
- **R10** — strict TypeScript, no `any`, no `console.*`, no dead/commented code,
  explicit return types on public methods.

Money is always a decimal string handled via `bignumber.js` — never a JS number.
