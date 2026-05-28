# wallet-sandbox

A small **spec-first NestJS** backend used to evaluate AI code-review tools.

The architecture, conventions, and code-style rules mirror a production service:
clean architecture (one handler per use-case), errors-as-values via
[`neverthrow`](https://github.com/supermacro/neverthrow), decimal-safe money via
`bignumber.js`, explicit locks + idempotency for non-idempotent operations, and a
logging contract. All rules live in [`.claude/rules/`](.claude/rules/) and code is
expected to be reviewed against them.

## Stack

Node.js + TypeScript (strict) + NestJS 11 + class-validator. Persistence and
locking are in-memory stand-ins so the sandbox runs without external
infrastructure, but the contracts match the production patterns described in the
rules.

## Layout

```
src/
├── lib/                      # framework-agnostic primitives
│   ├── clean/use-case.ts     # UseCaseHandler<Params, Result> contract
│   ├── money/                # BigNumber-backed decimal money
│   ├── concurrency/          # LockService (RedlockService stand-in)
│   └── idempotency/          # IdempotencyStore
├── infrastructure/logger/    # frozen event taxonomy (WalletEvent)
└── modules/
    ├── partner/              # API-key guard + in-memory partner registry
    └── wallet/               # domain, repository, use-cases, presentation
```

## Commands

```bash
npm install
npm run build      # tsc / nest build
npm test           # jest
npm run lint       # eslint (flat config)
npm run start:dev  # http://localhost:3000, Swagger at /openapi
```

## Auth

Every wallet endpoint is guarded by `x-api-key`. Demo keys: `demo-key-acme`
(owns `wallet-acme-usd`), `demo-key-globex` (owns `wallet-globex-usd`).

## Review rules

This repository is **spec-first**: code is checked against the rules in
[`.claude/rules/`](.claude/rules/) (R01–R15). Reviewers — human or AI — should
treat those files as the source of truth for architecture and style, and flag any
diff that violates them. See [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md).
