<div align="center">

# ⚡ PulseQA

### Automated Web Auditing &amp; E2E Test Execution Platform

Paste any URL → get a full quality report in seconds.<br/>
**Availability · Broken links · Console errors · Responsive layout · Accessibility · Performance · Security** — no test scripts required.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33?logo=playwright&logoColor=white)
![axe-core](https://img.shields.io/badge/axe--core-WCAG%202.1%20AA-663399)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-45%20passing-success)

<img src="docs/screenshots/dashboard.png" alt="PulseQA audit dashboard: KPI tiles, top issues, check breakdown and score trend" width="900" />

</div>

---

## 📑 Contents

- [Why PulseQA?](#-why-pulseqa)
- [Features](#-features)
- [Screenshots](#-screenshots)
- [How it works — the workflow](#-how-it-works--the-workflow)
- [The 11 checks in detail](#-the-11-checks-in-detail)
- [Architecture](#-architecture)
- [Privacy & security model](#-privacy--security-model)
- [Getting started](#-getting-started)
- [Configuration](#-configuration)
- [API reference](#-api-reference)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Roadmap](#-roadmap)

---

## 💡 Why PulseQA?

Every web app needs the same baseline quality checks before release — is it up, are links broken, does it throw errors, does it break on mobile, is it accessible, is it fast, is it secure? Doing that by hand (or writing a test script for every new project) is slow and easy to skip.

**PulseQA runs all of it automatically against _any_ URL** using a real Chromium browser, streams the progress live, stores every run, and compares each run with the previous one so you can see what **regressed** or got **fixed**.

---

## ✨ Features

| | |
|---|---|
| 🔍 **11 automated checks** | Smoke, links & images, console & network, responsive, accessibility (WCAG 2.1 AA), performance (Core Web Vitals), security headers, SEO, visual regression, cross-browser and a **20-page site crawl** |
| ⚡ **Live progress** | Server-Sent Events stream each check as it finishes, with a terminal-style live log |
| 📱 **Desktop + mobile** | 3 viewports (1920 · 768 · 375 px) with screenshots; throttled mobile performance profile (4G, 4× CPU); accessibility scanned on desktop **and** mobile |
| 🎯 **Low-noise results** | First-party vs third-party error split, bot-protection detection, HEAD→GET fallback, clipped-overflow detection |
| 📊 **Audit dashboard** | Tabbed workspace (Overview · Issues · Checks · Screenshots · Log) with shareable `?tab=` links — KPI tiles, ranked top issues, per-check breakdown, score-trend chart and run-to-run changes |
| 🛠️ **How-to-fix tips** | Every issue comes with remediation guidance — what to change, where it was found, a copy-paste example (e.g. a ready CSP header) and a docs link — in the dashboard and the exported report |
| 🔁 **Regression tracking** | Pick any earlier run of the same URL in *Compare to* — score and issue deltas, **NEW** issue badges, fixed issues |
| 📄 **Export & share** | Self-contained HTML report (screenshots embedded), raw JSON, or a read-only share link |
| 🎥 **Session recording** | Every audit records a video of the browser on the page — load, checks and auto-scroll — playable in the Log tab and downloadable |
| ⛔ **Cancel & time limits** | Cancel any running audit; hard 7-minute ceiling per audit; per-check timeouts |
| 🔒 **Private by default** | No login needed — each browser only sees its own latest 10 audits, each kept for 10 days (anonymous, hashed owner ID; older runs auto-deleted) |
| 🛡️ **Safe to host publicly** | SSRF guard on every navigation, redirect and link probe; rate limiting; duplicate-run protection |
| 🚀 **Landing page** | Product landing page at `/` with a one-click *Run free audit* box (advanced options at `/new`) |
| 🌗 **Light / dark UI** | Clean dashboard with a live terminal panel, mobile-friendly |

---

## 📸 Screenshots

| Landing page | Issues & how to fix them |
|---|---|
| <img src="docs/screenshots/landing.png" alt="PulseQA landing page with a one-click audit box" /> | <img src="docs/screenshots/issues.png" alt="Issues tab with severity filters and a how-to-fix panel" /> |

---

## 🔄 How it works — the workflow

### 1. The user journey

```mermaid
flowchart LR
    A([🌐 Paste a URL]) --> B[Choose checks<br/>default: all 11]
    B --> C[▶ Run audit]
    C --> D{{Live dashboard}}
    D -->|SSE events| E[Checks finish one by one<br/>+ terminal live log]
    E --> F[📊 Score 0–100<br/>Pass / Warn / Fail]
    F --> G[🔎 Open any check's report]
    F --> O[📊 Overview: gauge, issues by type,<br/>trends, top issues]
    F --> H[🔁 Compare with any earlier run]
    F --> I[📄 Export HTML / JSON]
    F --> J[🔗 Share read-only link]
    F --> K[🗂 Saved to your history]
```

### 2. What happens behind the scenes

```mermaid
sequenceDiagram
    autonumber
    participant UI as React dashboard
    participant API as Express API
    participant Q as Audit queue
    participant E as Audit engine
    participant B as Browsers (Playwright)
    participant DB as PostgreSQL (Neon)

    UI->>API: POST /api/audits { url, checks }
    API->>API: Validate & normalize URL, rate-limit,<br/>identify browser (owner cookie)
    API->>DB: INSERT audit (status = queued)
    API->>Q: enqueue(audit)
    API-->>UI: 202 Accepted { id }
    UI->>API: GET /api/audits/:id/events (SSE)
    API-->>UI: snapshot

    Q->>E: start (max N audits in parallel)
    E->>B: open context → load page ONCE<br/>(capture console, network, timing)
    loop for each selected check
        E-->>API: check:started
        API-->>UI: event → spinner on that check
        E->>B: run check (own timeout, can't crash the audit)
        E->>DB: save result + screenshots
        E-->>API: check:completed
        API-->>UI: event → card turns Pass / Warn / Fail
    end
    E->>DB: score + overall status (completed)
    API-->>UI: audit:completed → summary, compare, export
```

### 3. Inside the audit engine

```mermaid
flowchart TD
    S([Audit starts]) --> G{Private hosts<br/>allowed?}
    G -- no --> R[Walk redirect chain<br/>block private IPs]
    G -- yes --> L
    R --> L[Load page once in Chromium<br/>record console · errors · requests]
    L -->|load failed| X[Smoke = FAIL<br/>other checks = SKIPPED]
    L -->|loaded| C1[Smoke] --> C3[Security · SEO] --> C4[Performance<br/>+ throttled mobile run]
    C4 --> AS[[Auto-scroll<br/>load lazy content]] --> C2[Console & Network]
    C2 --> C5[Links & Images<br/>parallel HTTP probes] --> C6[Accessibility<br/>axe-core + highlight] --> C7[Responsive<br/>3 viewports in parallel]
    C7 --> C8[Visual regression<br/>diff vs approved baseline] --> C9[Cross-browser<br/>Chromium · Firefox · WebKit]
    C9 --> CR[Site crawl<br/>up to 20 internal pages] --> SC[Weighted score + overall status]
    X --> SC
    SC --> DONE([Saved & streamed to UI])

    CAN[[Cancel button / 4-min limit]] -.->|AbortSignal| C1 & C4 & C5 & C7
```

**Key design decisions**

- **One page load, many checks** – smoke, console/network, security, performance and accessibility all reuse the same loaded page, so most of an audit costs a single navigation.
- **Auto-scroll for lazy content** – after Performance has measured the untouched load, the page is scrolled to the bottom in steps (capped at 20 000 px / 10 s for infinite feeds) so lazy-loaded images and sections exist before links, accessibility, console and screenshot checks run; the Log tab shows how far it scrolled and how many lazy images appeared.
- **Failure isolation** – each check runs with its own timeout inside a `Promise.race`; one crashing check becomes `error` while the rest of the audit continues.
- **One shared browser** – parallel viewports and the mobile performance run are lightweight *contexts* inside a single Chromium process, keeping memory low on small servers.
- **Cancellable everywhere** – one `AbortSignal` (user cancel + overall timeout) flows through the engine, checks and HTTP probes, and closes browser contexts immediately.

---

## 🧪 The 11 checks in detail

| Check | What it does | Fails when |
|---|---|---|
| 🌐 **Smoke & Availability** | HTTP status, redirect chain, page title, blank-page detection, viewport meta, above-the-fold screenshot. SEO notes (meta description, favicon, `lang`, `<h1>`) are informational. | 4xx/5xx, blank page |
| 🔗 **Broken Links & Images** | Collects every `<a>` and `<img>`, probes up to 150 links / 100 images (12 parallel, 4 per host) with browser-like headers, HEAD → GET fallback, redirects followed manually. 401/403/429 are reported as *restricted* (bot protection), not broken. | Broken internal link or any broken image |
| 🖥️ **Console & Network** | Uncaught exceptions, `console.error`, failed XHR/fetch and other failed requests — split into **first-party** and **third-party** (ads, analytics). Only first-party problems can fail. | First-party exception or failed API call |
| 📱 **Responsive UI** | Loads the page at desktop 1920×1080, tablet 768×1024 and mobile 375×812 in parallel, detects real horizontal scrolling (ignores clipped overflow), lists offending elements, full-page screenshots. | Horizontal overflow on any viewport |
| ♿ **Accessibility** | axe-core with WCAG 2.0/2.1 A + AA rules on **desktop (1920×1080) and mobile (375×812, touch, mobile UA)** in parallel; problems that only mobile users hit (e.g. icon-only menu links) are reported separately. Violations grouped by impact, with how-to-fix links and screenshots that **outline the failing elements**. | Any critical or serious violation on either viewport |
| 🚀 **Performance** | TTFB, FCP, LCP, CLS, load time, request count, transfer size, slowest resources — on desktop **and** a throttled mobile profile (1.6 Mbps, 150 ms RTT, 4× CPU, like Lighthouse). | A desktop metric above the "poor" threshold |
| 🛡️ **Security Headers** | HTTPS, HTTP→HTTPS redirect, CSP, X-Frame-Options / `frame-ancestors`, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, mixed content, cookie flags, server info leaks. | No HTTPS or mixed content |
| 🔎 **SEO** | Title & meta description length, canonical URL, `noindex` (meta + `X-Robots-Tag`), `lang`, one `<h1>` and heading order, image `alt`, Open Graph / Twitter card (with a **social share preview**), JSON-LD structured data, `robots.txt` and XML sitemap (fetched with the same SSRF guard). | Missing title, `noindex`, or robots.txt blocking the whole site |
| 🖼️ **Visual Regression** | Captures desktop (1440×900) and mobile (375×812) screenshots with animations frozen and **pixel-diffs** them (pixelmatch) against the **approved baseline** for that URL — Baseline · Current · Diff view, % of pixels changed, page-height change. The first run becomes the baseline; approve any later run as the new one with one click (Percy-style). The baseline is never pruned. | More than 15 % of pixels changed or the page height changed by more than 25 % (0.5–15 % = warning) |
| 🧭 **Cross-browser** | Loads the page in **Chromium, Firefox and WebKit (Safari)** — one after another, extra browsers launched only for this check and closed right after — and compares load success, load time, first-party JS/console errors, failed requests, horizontal overflow and screenshots. | Loads in Chrome but not in Firefox/WebKit (browser-only errors or layout differences = warning) |
| 🕸️ **Site Crawl** | Follows internal links from the audited page (same site, 3 clicks deep, **up to 20 pages**, 3 at a time, respects robots.txt, skips files and tracking params) and checks every page: HTTP status, load time, first-party JS errors, broken images, critical/serious axe violations, title / description / h1 — plus duplicate titles across the site. Shows a filterable, worst-first pages table. | Any broken page (4xx/5xx or not loading); slow pages (>3 s), JS errors, a11y issues or duplicate titles = warning |

**Issue severity (Overview):** every finding is grouped into an *issue* and ranked — **errors** (e.g. broken images, first-party exceptions, critical/serious a11y, poor Core Web Vitals, no HTTPS), **warnings** (moderate a11y, missing security headers, broken external links, console errors) and **notices** (minor a11y, SEO notes, bot-protected links, third-party noise).

**Remediation:** each issue carries a short fix (`packages/shared/src/remediation.ts`) — e.g. *Missing Content-Security-Policy* → a starter `Content-Security-Policy: default-src 'self'; …` header plus where to set it (helmet, Nginx, Vercel/Netlify, Cloudflare); accessibility issues reuse axe-core's per-element advice and the offending HTML.

**Scoring:** each check has a weight (smoke 3, security 1, others 2). Pass = 100 %, Warn = 50 %, Fail/Error = 0 %, Skipped is excluded. The overall result is the worst check status.

---

## 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Client["🖥️ apps/web — React 19 + Vite"]
        P1[New audit] --- P2[Audit dashboard<br/>+ live log] --- P3[History]
    end
    subgraph Server["⚙️ apps/server — Express 5"]
        R[REST routes] --> QQ[Queue<br/>p-limit]
        QQ --> EN[Audit engine]
        EN --> CH[7 check modules]
        R --> SSE[SSE event bus]
        EN --> SSE
    end
    subgraph Shared["📦 packages/shared"]
        T[Types · scoring]
    end
    Client <-->|JSON + SSE| R
    CH <-->|Playwright| BR[(Chromium)]
    EN --> DB[(PostgreSQL<br/>Neon)]
    EN --> FS[(Screenshots<br/>/artifacts)]
    Shared -.-> Client
    Shared -.-> Server
```

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Query, React Router, lucide icons |
| Backend | Node.js, Express 5, TypeScript (tsx), Zod validation, express-rate-limit |
| Browser automation | Playwright (Chromium), @axe-core/playwright, Chrome DevTools Protocol throttling |
| Database | PostgreSQL on Neon, Drizzle ORM + migrations |
| Live updates | Server-Sent Events |
| Testing | Vitest, Supertest, Playwright against local fixture sites |

```
pulseqa/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── audit/
│   │   │   │   ├── checks/        # smoke, links, consoleNetwork, responsive, accessibility, performance, security
│   │   │   │   ├── engine.ts      # page load, check orchestration, timeouts, cancellation
│   │   │   │   ├── runner.ts      # persistence + live events
│   │   │   │   ├── queue.ts       # concurrency limit + cancel switches
│   │   │   │   └── browser.ts     # shared Chromium, contexts, SSRF route guard, throttling
│   │   │   ├── routes/audits.ts   # REST + SSE endpoints
│   │   │   ├── lib/               # URL guard (SSRF), owner cookie, site (1st/3rd party)
│   │   │   └── db/                # Drizzle schema + client
│   │   ├── drizzle/               # SQL migrations
│   │   └── test/                  # unit, API and browser integration tests + fixture pages
│   └── web/src/
│       ├── pages/                 # NewAudit, AuditDetail, History
│       ├── components/            # Overview dashboard, SVG charts, check reports, UI kit
│       └── lib/                   # API client, SSE hook, compare, export
└── packages/shared/               # types, scoring + issue classifier shared by server and web
```

---

## 🔐 Privacy & security model

**No login, still private.** Each browser receives a random 256-bit secret in an `httpOnly` cookie. The database stores **only its SHA-256 hash**, so a database leak can't be used to impersonate anyone.

| Action | Who can do it |
|---|---|
| See an audit in **History** | Only the browser that created it |
| Open an audit **by link** | Anyone with the link (read-only view, shown as "Shared report") |
| **Cancel / delete** an audit | Only its owner (others get `403`) |
| See **trends & run comparison** | Only the owner |

**Hardening for public hosting**

- **SSRF protection** (`ALLOW_PRIVATE_HOSTS=false`): the target, every redirect hop, every browser request and every link probe is checked; anything resolving to localhost / private / link-local ranges is blocked.
- **Rate limiting:** 10 new audits per minute per client; identical audits already running are de-duplicated.
- **Resource limits:** max concurrent audits, per-check timeouts, 7-minute audit ceiling, capped link/image counts and screenshot heights.

---

## 🚀 Getting started

### Prerequisites

- **Node.js 20+** (developed on Node 24)
- A **PostgreSQL** database — a free [Neon](https://neon.tech) project works great

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Download the browsers used for audits (Chromium, Firefox, WebKit)
npm run playwright:install

# 3. Configure environment
cp .env.example .env        # then paste your Neon connection string into DATABASE_URL

# 4. Create the database tables
npm run db:migrate

# 5. Start API (:4000) + dashboard (:5173)
npm run dev
```

Open **http://localhost:5173**, paste a URL and press **Run audit**.

> **Windows note:** if the project folder name contains `&`, npm's `.cmd` shims break. The scripts already work around this by calling each tool's JS entry with `node`. Renaming the folder (e.g. `PulseQA`) avoids the issue entirely.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | API (watch mode) + web dashboard together |
| `npm test` | Unit, API and browser integration tests |
| `npm run typecheck` | Type-check server and web |
| `npm run build` | Production build of the web app |
| `npm start` | Start the API (also serves the built web app) |
| `npm run db:generate` | Create a migration after changing `apps/server/src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |

---

## ⚙️ Configuration

Set in `.env` at the project root (see [`.env.example`](.env.example)).

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string (**required**) |
| `PORT` | `4000` | API port |
| `MAX_CONCURRENT_AUDITS` | `2` | Audits that run at the same time (others wait in the queue) |
| `HISTORY_LIMIT` | `10` | Audits kept per browser — when a new one starts, the oldest finished ones (and their screenshots) are deleted |
| `HISTORY_MAX_AGE_DAYS` | `10` | Audits older than this are deleted automatically (checked at startup and every hour), with their screenshots and videos |
| `CRAWL_MAX_PAGES` | `20` | Pages the Site Crawl check visits per audit (1–200) |
| `ALLOW_PRIVATE_HOSTS` | `true` | Allow auditing localhost / private networks. **Set `false` when hosting publicly.** |
| `ARTIFACTS_DIR` | `./artifacts` | Where screenshots are stored |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed web origin(s), comma-separated |
| `CROSS_SITE_COOKIES` | `false` | `true` only if the web app and API are on different sites |
| `WEB_DIST_DIR` | `../web/dist` | Built web app served by the API (single-service deploy) |

---

## 📡 API reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/audits` | Start an audit `{ url, checks? }` → `202` (or `200` with `deduplicated: true`) |
| `GET` | `/api/audits?page=&limit=&q=` | Your history (filter by URL with `q`) |
| `GET` | `/api/audits/:id` | Audit with all results and screenshots (`isOwner` flag) |
| `GET` | `/api/audits/:id/events` | Live progress stream (SSE) |
| `GET` | `/api/audits/:id/history` | Completed runs of the same URL up to this one — scores + summaries for trends (owner only, `[]` for others) |
| `GET` | `/api/audits/:id/previous` | Previous completed run of the same URL (owner only) |
| `POST` | `/api/audits/:id/cancel` | Cancel a queued/running audit (owner only) |
| `DELETE` | `/api/audits/:id` | Delete an audit and its screenshots (owner only) |
| `GET` | `/api/health` | API, database and queue status |

**SSE events:** `snapshot` · `audit:started` · `check:started` · `check:completed` · `audit:completed` · `audit:failed`

---

## ✅ Testing

```bash
npm test
```

**45 tests** across three levels:

- **Unit** – URL validation & SSRF IP ranges, first/third-party site detection, scoring, performance thresholds.
- **API** – validation, ownership & privacy rules (403s, scoped history, owner-only trends), de-duplication, cancel/delete rules, rate limiting (Supertest, DB mocked).
- **Browser integration** – the real engine runs against local **fixture websites**: a deliberately broken page (broken link & image, JS exception, failed API call, mobile overflow, missing alt text, low contrast, no HTTPS) must be caught and ranked as errors in the Overview; a clean page must pass with zero errors; plus third-party noise, unreachable hosts, SSRF blocking, cancellation and the time limit.

---

## ☁️ Deployment

Simplest option — **one service** serves both the API and the dashboard (so the privacy cookie works without extra setup):

```bash
npm install
npm run playwright:install   # Chromium + Firefox + WebKit (or use the official Playwright Docker image)
npm run build                # builds apps/web/dist
npm run db:migrate
npm start                    # API + dashboard on $PORT
```

Production checklist:

- [ ] `ALLOW_PRIVATE_HOSTS=false`
- [ ] `DATABASE_URL` points to your Neon (or other Postgres) database
- [ ] Persistent disk (or object storage) for `ARTIFACTS_DIR`
- [ ] A host that can run Chromium (e.g. Render, Railway, Fly.io, a VPS — not serverless functions)

---

## 🗺️ Roadmap

- [x] **Step 1 — Generic URL audits** (this release)
- [ ] **Step 2 — App-specific E2E suites:** Playwright Page Object Model tests for your own apps — user journeys, auth, form validation, CRUD, regression and cross-browser (Chromium / Firefox / WebKit)
- [ ] **Step 3 — Backend & load:** REST API testing and lightweight load testing (k6)
- [ ] CI integration — run audits from GitHub Actions with a score threshold

---

## 📄 License & security

- Released under the [MIT License](LICENSE).
- Found a vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md).

---

<div align="center">

Built with TypeScript, Playwright and a lot of ☕

</div>
