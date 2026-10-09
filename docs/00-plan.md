# 00 — Modernization plan: BofA Online Banking Transfers portal

**Source:** [jennamansueto/bofa-portal](https://github.com/jennamansueto/bofa-portal) — Struts 1.3.10 / JSP 2.1 / Servlet 2.5 / Java 7 on JDK 8 / Tomcat 7 / jQuery 1.7.2 / HSQLDB 1.8 (DB2 stand-in) / JDBC DAOs / log4j 1.2 / unsalted MD5.
**Target:** [jennamansueto/bofa-modernized](https://github.com/jennamansueto/bofa-modernized) — Java 21 + Spring Boot 3 (REST) + PostgreSQL (docker-compose, Testcontainers) / React 18 + TypeScript + Vite / Playwright acceptance suite.

Nothing is merged to `main`. Every piece of work lands on a feature branch with a PR for review.

## Why this shape

The business rules (R1–R10 in the `TransferService` class comment: tier fees/limits from `OLB_FEE_SCHED`, 8 PM ET cutoff, Fed holidays, Reg D savings limit, balance holds, `XFRyyMMdd-nnnnnn` confirmations, 3-strike lockout, 10-minute session) exist only in Java + seed SQL. The plan therefore front-loads **recovery** (Phase 1) so the **build** (Phase 2) implements a written, numbered spec, and the **proof** (Phase 3) is a Playwright suite whose test titles are the AC IDs.

## Phase 0 — parent (done)

| Step | Output |
|---|---|
| Run legacy app via `./run.sh` (JDK 8, Maven, Tomcat 7.0.109) | `http://localhost:8080/`, login `demo.user` / `Password1` |
| Recording #1 — legacy walkthrough | landing → login → Transfer Money → live summary (amount/tier) → internal transfer + confirmation + balances → external Chase quote (Standard tier) → same From/To validation error |
| This plan | `docs/00-plan.md` |

Observed in the legacy run (to be confirmed by Child A): Standard-tier **EXS** (3 business days) has **no fee** and a $3,500 limit; Standard-tier **EXN** (next business day) charges **$3.00**; Gold tier is fee-free on both. Next-business-day delivery from Fri 10/09/2026 landed on **Tue 10/13** because Columbus Day is in `OLB_BANK_HOL`.

## Phase 1 — three analysis children, in parallel (read-only on legacy)

| Child | Reads | Produces |
|---|---|---|
| **A — Business rules** | `TransferService`, `BusinessCalendar`, `TransferDAO`, `CustomerDAO`, `AuthFilter`, `schema.sql`, `seed.sql` | `docs/01-acceptance-criteria.md` — 25–40 numbered `AC-xx` Given/When/Then criteria, each with legacy file:line pointers and the concrete seeded values that make it testable; `/secure/quote.do` JSON contract |
| **B — UI/UX** | JSPs, `olb.css`, `olb.js`, images, running app | `docs/02-ui-spec.md` — page + component inventory, design tokens, every visible string, every field + validation, AJAX summary behaviour, a11y defects to fix, screenshots |
| **C — Data & platform** | `schema.sql`, `seed.sql`, DAOs, `pom.xml`, `web.xml` | `docs/03-data-and-platform.md` — PostgreSQL schema (money representation justified), seed migration, EOL/CVE table with replacements, security debt (MD5, session, CSRF, no-cache) → modern equivalents |

Parent then cross-checks A against the `TransferService` R1–R10 comment and every `OLB_FEE_SCHED` row, fills gaps, and attaches the final docs 01–03.

## Phase 2 — three build children, in sequence

1. **D — Backend** (Spring Boot 3, Java 21, PostgreSQL): auth with bcrypt + 3-strike lockout, accounts, transfer quote/submit/history, business calendar (ET cutoff, holiday table), fee schedule table. Unit + Testcontainers integration tests named by AC ID. OpenAPI published. PR.
2. **E — Frontend** (React 18 + TS + Vite) — starts when D's API is runnable. Implements `02-ui-spec.md` against D's OpenAPI: landing/login, Transfer Money with live quote, confirmation, error states. BofA look (navy/red, FDIC bar, product nav, gradient hero, white panels) done responsively and accessibly, no layout tables. PR.
3. **F — Acceptance** — starts when E is runnable. Playwright suite, each test titled `AC-xx <criterion>`, driving real UI → real API → real PostgreSQL. Produces `docs/04-traceability.md` (AC → legacy source → modern test → status). PR.

## Phase 3 — parent finale

1. `docker-compose up` the modern stack with seeded demo data.
2. Recording #2: show `01-acceptance-criteria.md` → headed Playwright run with AC titles → manual replay of the recording-#1 flow in the new UI.
3. `docs/05-summary.md`: before/after stack table, criteria recovered vs. passing, child-session map with links, behaviour deliberately not preserved (MD5, 10-minute session, etc.) and why.
4. Final report: PR links, child links, both recordings, 5-line summary.

## Ground rules carried into every child brief

- Legacy code is the source of truth for ambiguous behaviour; preserve it and record it in traceability rather than silently "fixing" it (security items flagged by Child C excepted).
- Attach every markdown artifact to the session.
- Feature branches + PRs only; never push to `main`.
