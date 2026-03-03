# Password Protection

## Overview

The app uses HTTP Basic Authentication to gate the entire UI behind a login prompt. This prevents unauthorised visitors from accessing the dashboard and triggering audits via the "Run All Brands" or "Test Single Brand" buttons, which would otherwise consume API capacity and database writes.

Implementation uses Next.js 16's **proxy** convention (formerly `middleware.ts` in earlier Next.js versions). The proxy runs before requests reach the app and returns a `401` with `WWW-Authenticate` unless valid credentials are supplied, which triggers the browser's native login prompt.

---

## How It Works

### Architecture

```
Incoming Request
       │
       ▼
┌──────────────────┐
│  proxy.ts        │  Runs on every matched request
│  (project root)  │
└────────┬─────────┘
         │
         ├── Path excluded? (_next/*, api/*, favicon) ──▶ Pass through
         │
         ├── BASIC_AUTH_PASSWORD not set? ──▶ Pass through (local dev)
         │
         ├── Valid Basic Auth credentials? ──▶ Pass through
         │
         └── Otherwise ──▶ 401 + WWW-Authenticate prompt
```

### Implementation

The proxy lives at `proxy.ts` in the project root:

- **Matcher**: A regex excludes `/_next/static`, `/_next/image`, `favicon.ico`, and all `/api/` routes. Only page routes (e.g. `/`, `/batch/[id]`) and static assets outside `_next` hit the auth logic.
- **Auth check**: If `BASIC_AUTH_PASSWORD` is set, the request must include a valid `Authorization: Basic <base64(user:password)>` header.
- **Graceful skip**: If `BASIC_AUTH_PASSWORD` is not set (e.g. local development), the proxy allows all matched requests through without prompting.

### Next.js 16 Convention

Next.js 16 renamed the previous middleware feature:

- **File**: `middleware.ts` → `proxy.ts`
- **Export**: `middleware()` → `proxy()`
- **Behaviour**: Same API (`NextRequest`, `NextResponse`, `config.matcher`), unchanged logic.

---

## What Is Protected

| Path | Protected? | Notes |
|------|------------|-------|
| `/` | Yes | Homepage dashboard |
| `/batch/[id]` | Yes | Batch detail pages |
| Any other page route | Yes | Future routes by default |

Visitors must enter username and password before reaching any of these pages or triggering server actions (which call the internal APIs from the server with `CRON_SECRET`).

---

## What Is Excluded

| Path | Reason |
|------|--------|
| `/api/cron/run-audit` | Vercel Cron uses `x-vercel-cron` header, not Basic Auth |
| `/api/probes/*` | Internal calls from audit service with Bearer `CRON_SECRET` |
| `/api/audit/single-brand` | Internal calls with Bearer `CRON_SECRET` |
| `/_next/static`, `/_next/image` | Build output and image optimisation |
| `favicon.ico` | Favicon |

These API routes enforce their own Bearer token auth via `CRON_SECRET`. They are not exposed to Basic Auth because they are excluded by the matcher.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASIC_AUTH_USER` | Yes (when using auth) | Username for the login prompt |
| `BASIC_AUTH_PASSWORD` | Yes (when using auth) | Password for the login prompt |

**Vercel**: Add both in **Project Settings → Environment Variables** for **Production** and **Preview**. Redeploy after changing them.

**Local**: Do not add them to `.env.local` so the proxy skips auth and local development stays unblocked.

---

## Setup Checklist

1. Add `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` to Vercel environment variables.
2. Redeploy the project.
3. Visit the site and confirm the browser shows a Basic Auth prompt.
4. Enter the credentials; the app should load and function normally.

---

## Interaction With Existing Auth

The app has two layers of protection:

1. **Basic Auth (proxy)**: Protects the UI. Random visitors cannot see or use the dashboard.
2. **Bearer token (CRON_SECRET)**: Protects all API routes. Only requests with `Authorization: Bearer <CRON_SECRET>` (or Vercel Cron’s `x-vercel-cron` for the cron endpoint) are accepted.

The server actions on the homepage call the APIs using `CRON_SECRET` server-side. Users only reach those actions after passing Basic Auth, so both layers remain in effect.
