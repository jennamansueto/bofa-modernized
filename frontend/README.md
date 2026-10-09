# OLB Transfers — web frontend

React 18 + TypeScript (strict) + Vite rebuild of the legacy Struts 1 Transfer Money UI
(`jennamansueto/bofa-portal`). The UI spec is `docs/02-ui-spec.md`; acceptance criteria are in
`docs/01-acceptance-criteria.md`. All business rules, pricing and messages come from the Spring Boot
API in `../backend` — the frontend only renders the server's display strings.

## Stack

| Concern | Choice |
|---|---|
| Build / dev server | Vite 5 |
| UI | React 18, React Router 6 (data router) |
| Server state | TanStack Query 5 (accounts, history, receipt, login/logout/submit) |
| Live quote | `useQuote` hook — 250 ms debounce, `AbortController`, last-request-wins |
| API types | `src/api/types.ts`, hand-written from `backend/openapi.json` |
| Styling | Vanilla CSS + CSS Modules; tokens from doc 02 §4 in `src/styles/tokens.css` |
| Tests | Vitest + Testing Library (jsdom) |

## Run

### Whole system (Docker)

From the repo root:

```bash
docker compose up --build
# UI + API on one origin:  http://localhost:3000   (nginx serves the build, proxies /api → backend:8080)
```

Sign in with `demo.user` / `Password1` (Preferred Rewards Gold) or `sam.chen` / `Password1` (Standard).

### Dev server against the composed backend

```bash
docker compose up -d postgres backend    # API on :8080
cd frontend
npm ci
npm run dev                               # http://localhost:5173, /api proxied to :8080
```

Override the proxy target with `VITE_API_PROXY=http://host:port npm run dev`.

### Scripts

```bash
npm run lint        # eslint (typescript-eslint, react-hooks, jsx-a11y)
npm run typecheck   # tsc -b --noEmit (strict)
npm test            # vitest run
npm run build       # typecheck + production build to dist/
```

## Routes

| Path | Legacy | Notes |
|---|---|---|
| `/` | `index.jsp` / `login.do` | Public landing + sign-in. `/?expired=1` shows the "session has ended" banner. |
| `/transfers` | `secure/transfer.do` | Authenticated. Account cards, recent activity, transfer form + live summary. |
| `/transfers/confirmation/:conf` | `secure/transferConfirm.do` | Receipt + updated balances. Unknown confirmation → back to `/transfers`. |
| anything else | `error.jsp` | Branded "We're sorry" page with `Error reference: ERR-… · HTTP 404`. |

## Security model (browser side)

- Session is the backend's HttpOnly `SESSION` cookie; every request uses `credentials: 'include'`.
- CSRF: the client reads the `XSRF-TOKEN` cookie and sends `X-XSRF-TOKEN` on mutating `/api/secure/**` calls.
- Any 401 from `/api/secure/**` clears cached data and redirects to `/?expired=1` (legacy `AuthFilter`, AC-07).
- A warning dialog appears 60 s before the 10-minute inactivity timeout with "Stay signed in" (a11y defect A13).

## Layout

```
src/
  api/          typed client (fetch + CSRF), DTO types, TanStack Query hooks
  auth/         RequireAuth (401 → /?expired=1), SessionTimeoutDialog
  components/   layout (headers, footer, OLB shell) and small UI primitives
  features/     landing (sign-in, card offers, cookie notice), transfer (panel, summary, activity, quote hook)
  pages/        Landing, Transfer, Confirmation, Error
  styles/       tokens.css, global.css, components.css
```
