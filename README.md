# PulseQA — Automated Web Auditing & E2E Test Execution Platform

**Step 1: Generic URL Audit.** Paste any URL, click **Run audit**, and 7 Playwright checks run with no test script:

| Check | What it does |
|---|---|
| Smoke & Availability | HTTP status (404/5xx), redirect chain, title, blank-page detection, screenshot |
| Broken Links & Images | Probes every `<a>` / `<img>` (HEAD → GET fallback), internal vs external |
| Console & Network | JS console errors, uncaught exceptions, failed XHR/fetch and other requests |
| Responsive UI | Desktop 1920×1080, Tablet 768×1024, Mobile 375×812: horizontal overflow + full-page screenshots |
| Accessibility | axe-core WCAG 2.1 A/AA violations, grouped by impact |
| Performance | TTFB, FCP, LCP, CLS, load time, request count, transfer size |
| Security Headers | HTTPS, http→https redirect, CSP, X-Frame-Options, HSTS, nosniff, Referrer/Permissions-Policy, mixed content, cookies |

## Stack
- `apps/server`: Express 5 + TypeScript, Playwright, `@axe-core/playwright`, Drizzle ORM on **Neon Postgres**, live progress over **SSE**
- `apps/web`: React 19 + Vite + Tailwind v4 + TanStack Query + React Router
- `packages/shared`: types + scoring shared by both

## Setup
```bash
npm install
npm run playwright:install        # downloads Chromium
cp .env.example .env              # then paste your Neon pooled DATABASE_URL
npm run db:migrate                # creates tables on Neon
npm run dev                       # API :4000 + dashboard :5173
```
Open http://localhost:5173.

## Scripts
| Command | |
|---|---|
| `npm run dev` | API (tsx watch) + web (Vite) together |
| `npm test` | Unit tests + Playwright integration tests against local fixture pages (no DB needed) |
| `npm run typecheck` | Both apps |
| `npm run db:generate` | New migration after editing `apps/server/src/db/schema.ts` |

> **Windows note:** the folder name contains `&`, which breaks npm's `.cmd` shims. That's why scripts call tools as `node ../../node_modules/<tool>/...`. Renaming the folder (e.g. `PulseQA`) removes the issue.

## API
- `POST /api/audits` `{ url, checks? }` → `202` audit
- `GET /api/audits?page=&limit=` history
- `GET /api/audits/:id` audit + results + screenshots
- `GET /api/audits/:id/events` SSE stream (`snapshot`, `check:started`, `check:completed`, `audit:completed`, `audit:failed`)
- `DELETE /api/audits/:id`
- `GET /api/health`

Screenshots are written to `ARTIFACTS_DIR/<auditId>/` and served at `/artifacts/...`.
Set `ALLOW_PRIVATE_HOSTS=false` on a public deployment to block localhost/private-network targets (SSRF guard).
