# Security Policy

PulseQA opens arbitrary URLs in real browsers on a server, so security matters to this project. Thank you for helping keep it and its users safe.

## Supported versions

PulseQA is under active development. Security fixes go into the latest code on the `main` branch only.

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| Older commits / forks | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report it privately through GitHub instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** (GitHub private vulnerability reporting).
3. Describe the problem, the steps to reproduce it, the impact, and (if you have one) a suggested fix.

What to expect:

- **Acknowledgement** within 3 working days.
- **An initial assessment** (confirmed / not reproducible / out of scope) within 7 days.
- **A fix** as soon as possible depending on severity. Critical issues are prioritised.
- **Credit** in the fix's release notes, if you would like it.

Please give a reasonable amount of time for a fix before any public disclosure.

## Scope

Issues that are especially relevant:

- **Server-side request forgery (SSRF)**: making the audit browser, a redirect, a link probe, the robots.txt/sitemap fetch, or the site crawler reach `localhost`, private networks, or cloud metadata endpoints when `ALLOW_PRIVATE_HOSTS=false`.
- **Breaking audit privacy**: seeing, cancelling, deleting or approving baselines for another browser's audits, or recovering an owner secret from stored data.
- **Cross-site scripting** in the dashboard or the exported HTML report, using content taken from an audited site (titles, console messages, URLs and similar).
- **Path traversal** or arbitrary file access through `/artifacts`.
- **Resource exhaustion** that bypasses the existing limits (rate limit, concurrency limit, per-check timeouts, the 7-minute audit ceiling, the crawl page cap).

Out of scope:

- Problems found *by* PulseQA in a site you audited. Report those to that site's owner.
- Missing hardening on a deployment that ignores the checklist below.
- Denial of service through sheer volume of traffic.
- Vulnerabilities in third-party dependencies that are already publicly known and not exploitable in PulseQA. A pull request that updates the dependency is welcome.

## Built-in protections

| Area | Protection |
|---|---|
| SSRF | With `ALLOW_PRIVATE_HOSTS=false`, the target URL, every redirect hop, every browser request (route guard), every link probe and every crawler and robots.txt fetch is resolved and blocked if it points to a loopback, private or link-local address. |
| Privacy | No accounts. Each browser gets a random 256-bit `httpOnly` cookie; only its **SHA-256 hash** is stored. History, cancel, delete, trends and visual-baseline approval are restricted to the owner (`403` for others). Shared links are read-only. |
| Abuse limits | 10 new audits per minute per client, de-duplication of identical running audits, a concurrency limit and a queue, per-check timeouts, a 7-minute hard ceiling per audit, capped link, image and crawl counts, and capped screenshot sizes. |
| Data retention | Each browser keeps only its latest audits (`HISTORY_LIMIT`, default 10), and every audit is deleted after `HISTORY_MAX_AGE_DAYS` (default 10 days), together with its screenshots and video. |
| Browsers | Firefox and WebKit are launched only for the cross-browser check and closed straight away. Every audit runs in an isolated browser context. |

## Deployment checklist

If you host PulseQA publicly:

- [ ] Set `ALLOW_PRIVATE_HOSTS=false`. **This is required on any public deployment.**
- [ ] Serve the app over **HTTPS** only.
- [ ] Keep `DATABASE_URL` and `.env` out of version control, and use a database user with only the privileges PulseQA needs.
- [ ] Leave `CROSS_SITE_COOKIES=false` unless the web app and API are on different sites.
- [ ] Set `CORS_ORIGIN` to your own web origin(s) only.
- [ ] Run the server as a non-root user. The official Playwright Docker image is a good base.
- [ ] Put a reverse proxy or WAF in front of it for additional rate limiting.
- [ ] Keep dependencies and Playwright browsers up to date (`npm audit`, `npm run playwright:install`).
