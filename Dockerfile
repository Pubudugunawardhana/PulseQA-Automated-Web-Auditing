# PulseQA: one container that serves the API and the built dashboard.
# Base image: Node + Chromium, Firefox and WebKit with all their system libraries.
# Keep its version equal to the `playwright` package version in package-lock.json.
FROM mcr.microsoft.com/playwright:v1.65.1-noble

WORKDIR /app
ENV NODE_ENV=production \
    # browsers are already in the image (/ms-playwright) — don't download them again
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PORT=8080 \
    ARTIFACTS_DIR=/data/artifacts \
    ALLOW_PRIVATE_HOSTS=false \
    MAX_CONCURRENT_AUDITS=1

# 1) dependencies (cached until a package.json / the lockfile changes).
#    Dev dependencies are included on purpose: the server runs through tsx and migrations use drizzle-kit.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --include=dev --no-audit --no-fund

# 2) source + production build of the dashboard (served by the API from apps/web/dist)
COPY . .
RUN npm run build -w @pulseqa/web

# 3) run as the image's unprivileged user — the browsers open arbitrary websites.
#    The Fly volume is mounted at /data as root, so hand it to pwuser at start-up first.
EXPOSE 8080
WORKDIR /app/apps/server
CMD ["sh", "-c", "mkdir -p /data/artifacts && chown -R pwuser:pwuser /data && exec su pwuser -s /bin/sh -c 'node /app/node_modules/tsx/dist/cli.mjs src/index.ts'"]
