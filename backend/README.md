# OLB Transfers API (backend)

Spring Boot 3.5 / Java 21 / PostgreSQL 16 rebuild of the legacy Struts 1 Online Banking Transfers portal
([jennamansueto/bofa-portal](https://github.com/jennamansueto/bofa-portal)). Behaviour, error strings and seed data
are reproduced exactly from `docs/01-acceptance-criteria.md`; platform/security decisions follow
`docs/03-data-and-platform.md`.

## Run

### Everything in Docker

```bash
docker compose up --build          # from the repo root: postgres:16 + backend on :8080
curl -s http://localhost:8080/actuator/health
```

### Local JVM against the compose Postgres

```bash
docker compose up -d postgres
cd backend
mvn spring-boot:run               # uses jdbc:postgresql://localhost:5432/olb (olb/olb) by default
```

Flyway creates the schema (`V1__schema.sql`) and the legacy seed (`V2__seed.sql`) on first start.

### Demo credentials

| User | Password | Tier |
|---|---|---|
| `demo.user` | `Password1` | `10` Preferred Rewards Gold |
| `sam.chen`  | `Password1` | `00` Standard |

Both are stored bcrypt-hashed (cost 12). Three wrong passwords lock an ID permanently (legacy rule) — reset with
`docker compose down -v`.

### Try it with curl

```bash
# sign in (sets SESSION + XSRF-TOKEN cookies)
curl -si -c c.txt -X POST localhost:8080/api/login -H 'Content-Type: application/json' \
     -d '{"userId":"demo.user","password":"Password1","saveUserId":true}'

XSRF=$(grep XSRF-TOKEN c.txt | awk '{print $7}')
curl -s -b c.txt localhost:8080/api/secure/accounts | jq .
curl -s -b c.txt -X POST localhost:8080/api/secure/transfers/quote -H "X-XSRF-TOKEN: $XSRF" \
     -H 'Content-Type: application/json' \
     -d '{"fromAccountId":"ACCT-1001","toAccountId":"ACCT-1003","amount":"1,250.00","tierCode":"00","delivery":"EXN"}' | jq .
curl -s -b c.txt -X POST localhost:8080/api/secure/transfers -H "X-XSRF-TOKEN: $XSRF" \
     -H 'Content-Type: application/json' \
     -d '{"fromAccountId":"ACCT-1001","toAccountId":"ACCT-1002","amount":"250","tierCode":"10","memo":"Vacation"}' | jq .
curl -s -b c.txt localhost:8080/api/secure/transfers | jq .
```

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/login` | `{userId,password,saveUserId}` → customer; 401 `LOGIN_REQUIRED` / `LOGIN_INVALID` / `LOGIN_LOCKED` |
| POST | `/api/logout` | 204; invalidates the session |
| GET | `/api/csrf` | current XSRF token (also sent as a cookie on every response) |
| GET | `/api/secure/me` | name, tier, tier/frequency/delivery options, `sessionTimeoutSeconds` |
| GET | `/api/secure/accounts` | active accounts with current + available balances |
| GET | `/api/secure/transfers` | last 10, `crt_ts DESC, transfer_id DESC` |
| GET | `/api/secure/transfers/{confirmation}` | scoped to the signed-in customer (404 otherwise) |
| POST | `/api/secure/transfers/quote` | legacy `/secure/quote.do` (same display fields + structured fields); 422 on rule failure |
| POST | `/api/secure/transfers` | submit; 201 with confirmation, dates, fee, type and updated balances; 422 on rule failure |

OpenAPI: `/v3/api-docs` and `/swagger-ui.html`; the generated spec is committed at [`openapi.json`](openapi.json).

Error envelope (every non-2xx): `{"ok":false,"status":422,"code":"XFR_PERTXN","message":"<verbatim legacy text>"}`.
`code` = legacy message key minus `error.`, upper-cased (`error.xfr.daily` → `XFR_DAILY`).

## Security model

* Session cookie `SESSION` (HttpOnly, SameSite=Lax, Spring Session JDBC, **10 min** inactivity — legacy `web.xml`).
  Login invalidates any existing session and creates a new one (fixation protection, AC-01).
* Unauthenticated `/api/secure/**` → JSON 401 `UNAUTHENTICATED`; a stale/expired session cookie → 401
  `SESSION_EXPIRED` with the legacy "your session has ended due to inactivity" message (replaces the AuthFilter redirect).
* CSRF: cookie-to-header. Every response sets a readable `XSRF-TOKEN` cookie; mutating calls to `/api/secure/**` must echo
  it in `X-XSRF-TOKEN` (403 `CSRF_REJECTED` otherwise). `/api/login` and `/api/logout` are exempt.
* No-cache headers on every response (Spring Security defaults ≡ legacy AuthFilter / Struts `nocache`).
* CORS: `http://localhost:5173` / `http://127.0.0.1:5173` with credentials (override `OLB_CORS_ALLOWED_ORIGINS`).
* Passwords: bcrypt cost 12 (replaces unsalted MD5 — the only deliberate behavioural change, per doc 03 §6).

## Clock / demo knobs

| Env var | Purpose |
|---|---|
| `OLB_FIXED_NOW` | pin "now" at startup: ISO instant (`2026-10-09T16:00:00Z`) or ET local (`2026-10-09T12:00`) |
| `OLB_TEST_CLOCK_ENABLED=true` | exposes `GET/POST/DELETE /api/test/clock` (`{"now":"2026-10-09T23:30:00-04:00"}`) to move the clock at runtime (e2e/demos only) |
| `OLB_CUTOFF_HOUR` | 8 PM ET cutoff (default `20`) |

All business dates are computed in `America/New_York` regardless of the JVM/container timezone.

## Tests

```bash
mvn -B verify        # unit tests + Spring Boot integration tests on a Testcontainers postgres:16 (Docker required)
```

Test names carry the acceptance-criteria IDs they prove (`AC26_feeByTypeAndTier`, …). The integration tests start
from the exact V2 seed with the clock pinned to Fri 2026-10-09 12:00 ET — the reference date used in doc 01.
