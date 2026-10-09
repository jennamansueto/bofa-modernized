# bofa-modernized

Modernization of the legacy Struts 1 / JSP Online Banking **Transfers** portal
([`jennamansueto/bofa-portal`](https://github.com/jennamansueto/bofa-portal)) to:

- `backend/` — Spring Boot 3 / Java 21 / PostgreSQL REST API ([backend/README.md](backend/README.md))
- `frontend/` — React 18 + TypeScript + Vite UI ([frontend/README.md](frontend/README.md))
- `docs/` — plan, acceptance criteria, UI spec, data/platform notes

## Run everything

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Web UI (nginx, proxies `/api`) | http://localhost:3000 |
| API | http://localhost:8080 (`/v3/api-docs`, `/actuator/health`) |
| PostgreSQL | localhost:5432 (`olb` / `olb`) |

Demo login: `demo.user` / `Password1`. Set `FRONTEND_PORT` to change the UI port; `OLB_FIXED_NOW`
pins the backend clock (e.g. `OLB_FIXED_NOW=2026-10-09T12:00:00-04:00` for the spec's reference date).

## Develop

```bash
docker compose up -d postgres backend
cd frontend && npm ci && npm run dev     # http://localhost:5173, /api proxied to :8080
```
