# 05 — Migration summary: BofA Online Banking Transfers portal

## Before / after

| Layer | Legacy (`bofa-portal`) | Modern (`bofa-modernized`) |
|---|---|---|
| Language / runtime | Java 7 source on JDK 8 (EOL) | Java 21 LTS |
| Web framework | Struts 1.3.10 (EOL 2008, CVE-2014-0114 et al.), JSP 2.1 / Servlet 2.5 | Spring Boot 3 REST API + React 18 SPA |
| App server | Apache Tomcat 7.0.109 (EOL 2021) | Embedded Tomcat 10 (Spring Boot) behind nginx |
| Front end | JSP + jQuery 1.7.2, table layout, IE7/8 hacks | React 18 + TypeScript + Vite, CSS custom-property design tokens, responsive + accessible |
| Database | HSQLDB 1.8 in-memory (DB2 stand-in), hand-written JDBC DAOs | PostgreSQL 16, Flyway migrations (V1 schema, V2 seed) |
| Auth | Unsalted MD5, container session, plaintext `olb_uid` cookie | bcrypt (cost 12) via Spring Security, server-side session (10-min product timeout preserved), CSRF cookie-to-header, 3-strike lockout preserved |
| Logging | log4j 1.2.17 (EOL, CVE-2019-17571) | SLF4J / Logback (Spring Boot default) |
| Tests | none | 101 backend JUnit/Testcontainers tests + 13 Vitest + 46 Playwright acceptance tests named by AC id |
| Build / run | `./run.sh` → WAR on Tomcat | `docker compose up` (Postgres + API + UI on :3000) |

## Recovered acceptance criteria
- 42 criteria recovered from legacy source (`docs/01-acceptance-criteria.md`), each with legacy file:line pointers.
- Backend tests cover 36/42; Playwright: 46 tests pass / 0 fixme / 0 fail → 42/42 criteria PASS against the real docker-compose stack (`docs/04-traceability.md`).
- One parity bug caught by the suite and fixed in PR #3: a whitespace-only password was counted as a lockout strike; legacy treats it as blank (AC-02).
- Run it: `npm test` (headless, resets the DB) · `npm run test:demo` (4 headline flows, headed) · `npm run test:headed` — repo root, Node 22, docker running.

## Pull requests (stacked, nothing merged to `main`)
- #1 backend `devin/backend-spring-boot` → `main`: https://github.com/jennamansueto/bofa-modernized/pull/1
- #2 frontend `devin/frontend-react` → #1: https://github.com/jennamansueto/bofa-modernized/pull/2
- #3 Playwright + traceability `devin/e2e-playwright` → #2: https://github.com/jennamansueto/bofa-modernized/pull/3
- docs `devin/docs-phase0` → `main` (this document and docs 00–04)

## Child sessions
| Child | Responsibility | Session | Output |
|---|---|---|---|
| A | Business rules → acceptance criteria | https://devin-gtm.devinenterprise.com/sessions/be46e0baa4264d22938898802cbec0f0 | `docs/01-acceptance-criteria.md` |
| B | UI/UX spec + legacy screenshots | https://devin-gtm.devinenterprise.com/sessions/76db09bd13ae4985bd5f43ada4a064e7 | `docs/02-ui-spec.md`, `docs/images/legacy/` |
| C | Data & platform, security debt | https://devin-gtm.devinenterprise.com/sessions/10ceb47ebb644ea8aeac65998b61de0d | `docs/03-data-and-platform.md` |
| D | Spring Boot backend | https://devin-gtm.devinenterprise.com/sessions/a16e7a8b10004c9da3ed54ab904a0745 | PR #1 |
| E | React frontend | https://devin-gtm.devinenterprise.com/sessions/e3438d27c9b243e69d00e295b7dc66ff | PR #2 |
| F | Playwright suite + traceability | https://devin-gtm.devinenterprise.com/sessions/8e46f3fde6b1431387854277ea75e04a | PR #3, `docs/04-traceability.md` |

## Behaviour deliberately NOT preserved (and why)
| Legacy behaviour | Modern behaviour | Rationale |
|---|---|---|
| Unsalted MD5 password hashes | bcrypt cost 12 | Security; MD5 is trivially reversible. Same `Password1` demo credential. |
| Plaintext `olb_uid` "save user ID" cookie without flags | Same feature, cookie flagged HttpOnly/SameSite | Security hardening, same UX |
| Daily-limit error message rendered as `Today''s` with invalid JSON in the quote response (live summary silently failed) | Valid JSON; message text preserved with a single apostrophe | Legacy was a MessageFormat escaping bug, not a business rule |
| Server-rendered redirects (302 to `/index.jsp?expired=1`) | JSON 401 from the API; the SPA renders the same "session has ended" banner | SPA architecture; user-visible outcome identical |
| Table-based layout, missing labels/alt/landmarks, IE7/8 hacks | Semantic HTML, WCAG AA contrast, labelled fields, responsive | Accessibility and mobile support were required |
| Dead footer/nav links to nowhere | Plain text | Avoid dead links |
| (addition) none | "Stay signed in" warning before the 10-minute timeout | UX courtesy; timeout value unchanged |

Everything else — fee matrix, tier override, Reg D counting, same-day-only daily limit, 8 PM ET cutoff, holiday roll-forward, confirmation-number format, permanent lockout — is preserved exactly as the legacy code did it (see "Ambiguities / quirks preserved" in doc 01).

## Recordings
- #1 Legacy walkthrough: https://devin-gtm.devinenterprise.com/attachments/de5b9af6-d8a5-4020-a9d1-14f671a07a11/legacy-portal-walkthrough-edited.mp4
- #2 Modern system + acceptance tests: https://devin-gtm.devinenterprise.com/attachments/e7beb736-d1cd-40a9-9674-2e8711545d4d/rec-07318bf5-19b6-4259-8763-43047e02f47b-edited.mp4
