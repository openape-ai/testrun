# OpenApe Testrun

**Upload a test run — descriptions, screenshots, pass/fail — and share one
link that proves it works.**

https://testrun.openape.ai

An agent (or human) finishes a verification session, runs one command, and
gets a public report link:

```bash
ape-testruns upload ./out --title "Login flow E2E"
# → https://testrun.openape.ai/r/UO5dy3…
```

The link renders a dark, self-explanatory report: status badge, per-test
descriptions, steps with markdown captions and framed screenshots. It works
without login — the unguessable slug is the capability. Failed runs are
first-class: share the link as reproducible evidence instead of an assertion.

## Layout

| Path | What |
|---|---|
| `app/` | Nuxt 4 web app + Nitro API (`@openape-testrun/app`) — DDISA login via `@openape/nuxt-auth-sp`, SQLite (libsql) + Drizzle |
| `cli/` | `@openape/ape-testruns` — citty CLI, unified `apes login` auth via `@openape/cli-auth` |
| `scripts/` | SSH deploy (release rotation + systemd) and one-shot server setup |
| `fixtures/demo-run/` | Example run directory used for E2E verification |
| `skills/ape-testruns/` | Claude Code skill teaching agents the workflow |

## Quick start (local)

```bash
pnpm install
pnpm dev                  # app on http://localhost:3006

# in another shell — upload the demo fixture against your dev server
pnpm cli:build
APE_TESTRUNS_ENDPOINT=http://localhost:3006 node cli/dist/cli.mjs upload fixtures/demo-run
```

Auth: `apes login <email>` once per device (covers all OpenApe CLIs).
The web login lives directly on the start page.

## API surface

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/runs` | bearer/session | Create run from manifest, returns `{ id, slug, url, expected_assets }` |
| `PUT /api/runs/:id/assets/<path>` | bearer/session | Upload one screenshot (raw bytes, ≤8MB) |
| `GET /api/runs` | bearer/session | List own runs |
| `GET /api/runs/:id` | bearer/session | Run detail incl. uploaded assets |
| `DELETE /api/runs/:id` | bearer/session | Delete (share link 404s) |
| `GET /api/public/runs/:slug` | none | Render-ready report JSON (markdown pre-rendered, HTML-escaped) |
| `GET /api/public/runs/:slug/assets/<path>` | none | Screenshot bytes (immutable cache) |
| `POST /api/cli/exchange` | — | RFC 8693 token exchange for the CLI |

Manifest contract: `ape-testruns docs manifest` (source: `cli/src/docs/manifest.md`).

## Deploy

Tested-image Docker deploy on chatty, same mechanics as the four monorepo
web apps: `pnpm run deploy:image` builds `.output` natively, packages a
COPY-only amd64 image (`compose/package.Dockerfile`), smoke-tests it, pushes
to registry.openape.ai and lets chatty `docker compose pull && up` with an
`/api/health` gate and tag rollback (`TESTRUN_TAG_PREV`). The GitHub Actions
`Deploy` workflow runs the same script on every main push. nginx keeps
proxying 127.0.0.1:3006; the systemd unit stays disabled as the emergency
fallback. Details: `docs/deploy.md`.
