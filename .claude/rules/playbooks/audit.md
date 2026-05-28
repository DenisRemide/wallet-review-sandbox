# Playbook: spec-audit

Инструкция для команды `/spec-audit [scope]`. Полный аудит кодобазы (или одного модуля) со скорингом.

## Вход

- `[scope]` — опциональный путь (`src/modules/auth`, `src/infrastructure/rabbitmq`). Без аргумента — вся `src/`.

## Алгоритм

1. **Собери все файлы** в scope через `Glob` по паттернам из `manifest.yaml → file_types`.
2. **Для каждого типа файлов:**
   - прочитай применимые спеки (из `applies`);
   - для каждого файла — пройди по чек-листам спек;
   - сохрани нарушения в памяти (в структуре — не в файлах).
3. **Агрегируй нарушения по спекам** (R01..R11).
4. **Посчитай score для каждой спеки** по формуле:
   ```
   score = max(0, 10 - Σ(penalty_i))
   ```
   где `penalty_i` берётся из `manifest.yaml → severity` по severity нарушения. Штрафы суммируются, но итог не ниже 0.
5. **Посчитай overall score:**
   ```
   weighted_sum = Σ(score_i × weight_i)
   max_sum      = Σ(10 × weight_i)
   overall      = (weighted_sum / max_sum) × 100
   ```
   Округление до 1 знака после запятой.
6. **Сравни с последним отчётом** из `.claude/reports/` (если есть) → посчитай delta по каждой спеке и по overall.
7. **Определи топ-5 приоритетных исправлений**: нарушения severity=error, отсортированные по `weight × частота`.

## Формат отчёта

```markdown
---
date: 2026-04-13
commit: abc1234
branch: docs/spec
scope: src/
overall_score: 73.4
previous_score: 72.1
delta: +1.3
---

# Spec audit report — 2026-04-13

## Scores per spec

| ID | Спека | Score | Weight | Было | Δ |
|---|---|---|---|---|---|
| R01 | Архитектура | 9.0 | 1.5 | 9.0 | 0 |
| R02 | Result & errors | 8.5 | 1.5 | 9.0 | -0.5 ⚠ |
| R03 | Use-cases | 9.0 | 1.2 | 9.0 | 0 |
| R04 | Persistence | 7.0 | 1.2 | 7.0 | 0 |
| R05 | Transactions | 8.0 | 1.0 | 8.0 | 0 |
| R06 | Outbox | 7.0 | 1.0 | 7.0 | 0 |
| R07 | Encryption | 9.0 | 1.5 | 9.0 | 0 |
| R08 | API | 7.5 | 1.0 | 7.0 | +0.5 ✓ |
| R09 | Config | 9.0 | 0.8 | 9.0 | 0 |
| R10 | Code style | 7.0 | 0.8 | 7.0 | 0 |
| R11 | State machines | 3.0 | 1.3 | 3.0 | 0 |

**Overall: 73.4 / 100** (было 72.1, Δ +1.3)

## Top-5 приоритетов

1. **R11 — state machines не валидируются** (5 handler'ов пишут status напрямую)
   - src/modules/intent/use-case/verify-intent/verify-intent.handler.ts:45
   - ...
2. **R04 — закомментированный @Entity в intent.entity.ts:3**
3. **R10 — typo `repsoitory`** в user.repository.ts:17
4. **R10 — `COMPLITED` вместо `COMPLETED`** в intent.ts:6
5. **R06 — нет event contracts** — все createMessage<Record<string,any>>

## Полный список нарушений

### R02 errors (1)
- src/modules/foo/bar.ts:12 — throw new Error вместо err()

### R02 warnings (3)
...

## Что улучшилось

- R08: presentation-service auth-presentation.service теперь маппит все SignInErrorCode в HTTP явно (+0.5)
```

## Правила поведения

- **Отчёт всегда сохраняется** в `.claude/reports/<YYYY-MM-DD>-audit.md`. Если файл с этой датой уже есть — добавь суффикс `-2`, `-3`.
- **Отчёт идёт в commit.** После сохранения агент сообщает пользователю: «отчёт сохранён, не забудьте закоммитить `.claude/reports/<file>`».
- **Не исправляй код** в рамках `/spec-audit`. Только собирает данные.
- **Если overall score упал ниже `previous - degradation_threshold`** (из manifest) — в конце отчёта явный **DEGRADATION ALERT** с перечислением всех ухудшений.
- **Не включай в отчёт нарушения из `playbooks/`, `commands/`, `context/`, `reports/`** — они не часть кодовой базы.

## Периодичность

`/spec-audit` запускается:
- перед мержем большой фичи;
- раз в спринт как регулярный health-check;
- после обновления правил в `.claude/rules/` — чтобы увидеть, где новое правило подсвечивает проблемы.
