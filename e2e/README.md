# Playwright acceptance suite (`e2e/`)

End-to-end acceptance tests for the modernized Transfers portal, run against the **real** docker compose stack
(React/nginx on :3000, Spring Boot on :8080, PostgreSQL 16). No mocks. Every test is titled `AC-NN: <criterion>` from
`docs/01-acceptance-criteria.md`, so the HTML report and `docs/04-traceability.md` read like the criteria document.

## Commands (from the repo root or from `e2e/`)

| Command | What it does |
|---|---|
| `npm test` | `docker compose down -v && up -d --wait` with the test clock enabled, then the whole suite headless |
| `npm run test:quick` | Suite only (stack already running) |
| `npm run test:headed` | Headed Chromium, `slowMo`, video for every test — for demo recordings |
| `npm run test:demo` | Only the four headline demo flows (`tests/90-demo-flows.spec.ts`), headed |
| `npm run e2e:report` | Open the last HTML report (`e2e/report/`) |
| `npm run e2e:traceability` | Regenerate `docs/04-traceability.md` from `e2e/report/results.json` |

First time: `cd e2e && npm ci && npx playwright install chromium` (Node 22, Docker required).

## How determinism works

* The backend runs with `OLB_TEST_CLOCK_ENABLED=true` and `OLB_FIXED_NOW=2026-10-09T12:00` (Friday noon ET, the
  reference date of doc 01). That flag also enables the test-support endpoints under `/api/test/*`:
  `POST/DELETE /api/test/clock` (move/reset the clock), `POST /api/test/reset` (truncate + re-seed from `V2__seed.sql`)
  and `POST /api/test/fixtures/{name}` (two preconditions the seed cannot express: a second external account for AC-19,
  a non-effective fee row for AC-21). None of these exist when the flag is off.
* An automatic fixture (`fixtures/test.ts` → `seed`) resets the clock and the database before **every** test, so tests
  are independent and run serially (`workers: 1`). The 8 PM cutoff, holidays and the Regulation D month are driven by
  moving the backend clock; the 10-minute idle timeout uses Playwright's fake browser clock.
* API-only criteria (JSON contract, no-cache headers, 401s, confirmation sequence, fee/limit matrix) use Playwright's
  `request` context — the same cookie jar as the page, so UI and API steps can be mixed in one test.

## Layout

```
playwright.config.ts   projects: chromium (CI) and chromium-headed (demo: slowMo + video)
fixtures/api.ts        REFERENCE_NOW, users/accounts, OlbApi (login/quote/submit/history), clock + reset helpers
fixtures/test.ts       test fixtures: seed (auto reset), api, api2 (second customer), loggedInPage, UI helpers
tests/10-auth          AC-01..AC-10      tests/40-fees-limits  AC-25..AC-30
tests/20-transfer-page AC-11..AC-13      tests/50-dating       AC-31..AC-36
tests/30-validation    AC-14..AC-24      tests/60-persistence-confirmation AC-37..AC-42
tests/90-demo-flows    headline demo scripts (login → $1,250 → XFR261009-000001; EXN $3.00 + holiday; same account; lockout)
scripts/traceability.mjs  builds docs/04-traceability.md
report/                committed HTML + JSON report of the last full run
```
