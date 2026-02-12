# Phase 1 Implementation: Global Edge Efficiency Analyzer

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [System Components](#system-components)
3. [Setup Instructions](#setup-instructions)
4. [Environment Variables](#environment-variables)
5. [Running the System](#running-the-system)
6. [How It Works](#how-it-works)
7. [Data Model](#data-model)
8. [Troubleshooting](#troubleshooting)
9. [Verification Checklist](#verification-checklist)

---

## Architecture Overview

The Global Edge Efficiency Analyzer is a distributed auditing system that measures caching and performance behavior of major websites from 5 global regions simultaneously. The system consists of:

- **5 Regional Probe Endpoints** - Edge functions deployed to specific regions (US East, London, San Francisco, Frankfurt, Sydney)
- **Orchestrator** - A cron job that coordinates audits across all probes
- **Database** - Neon Postgres storing time-series audit data
- **Minimal UI** - Dashboard for manual triggers and recent results

### Request Flow

```
┌─────────────┐
│ Vercel Cron │ (hourly)
│  or Manual  │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│  run-audit API   │ (Orchestrator)
└──────┬───────────┘
       │
       ├─────────┬─────────┬─────────┬─────────┐
       ▼         ▼         ▼         ▼         ▼
   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
   │ IAD1 │ │ LHR1 │ │ SFO1 │ │ FRA1 │ │ SYD1 │ (5 probes)
   └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘
      │        │        │        │        │
      └────────┴────────┴────────┴────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Neon Postgres  │
              │   (audit_logs)  │
              └─────────────────┘
```

---

## System Components

### 1. Database Layer (`lib/db.ts`)
- Exports a `sql` query function using `@neondatabase/serverless`
- Defines TypeScript interfaces for audit log records
- Single source of truth for database connection

### 1b. Data Access Layer (`lib/data/audit-logs.ts`)
- All SQL queries for `audit_logs` live here
- `getRecentAuditLogs(limit?)` - fetch recent rows
- `getLatestRunSummary(withinHours?)` - latest run aggregates
- `insertAuditLogs(rows)` - batch insert probe results
- Consumed by services; never by UI directly

### 1c. Analytics Layer (`lib/analytics.ts`)
- Reusable analysis functions for future pages
- `getRegionalMetrics`, `getCacheHitRates`, `getTrendSeries`, `getBrandSummaries`, `getRunHistory`
- Time-windowed metrics (1h, 24h, 7d, 30d)
- Returns serializable objects for Server Components and API routes

### 2. Probe Logic (`lib/probe-logic.ts`)
- Shared function `runProbe(url, region)` that:
  - Executes HEAD requests with 6-second timeout
  - Measures Time to First Byte (TTFB)
  - Extracts 18 standard and CDN-specific headers
  - Returns typed success/error results

### 3. Regional Probe Routes
Five API routes, each pinned to a specific Vercel region:
- `/api/probes/iad1` (US East)
- `/api/probes/lhr1` (London)
- `/api/probes/sfo1` (San Francisco)
- `/api/probes/fra1` (Frankfurt)
- `/api/probes/syd1` (Sydney)

Each route:
- Validates bearer token authorization (`CRON_SECRET`)
- Accepts `?url=` query parameter
- Delegates to shared `runProbe()` logic
- Returns JSON with region, TTFB, status, headers, and optional error

### 4. Audit Service (`lib/services/audit-service.ts`)
Core orchestration logic:
- Processes brands from `config/brands.ts` in batches of 5
- For each brand, calls all 5 probe endpoints in parallel using `Promise.all()`
- Generates a unique `request_id` (UUID) per brand to group the 5 regional results
- Flattens results and performs batch inserts into `audit_logs`
- Returns summary: brands audited, rows inserted, errors

### 5. Cron Endpoint (`app/api/cron/run-audit/route.ts`)
- Entry point for scheduled and manual audits
- Accepts either:
  - Vercel cron header (`x-vercel-cron`)
  - Bearer token authorization for manual triggers
- Constructs base URL for self-referencing probe calls
- Invokes `runFullAudit()` and returns JSON summary

### 6. Dashboard UI (`app/page.tsx`)
Server-rendered page with:
- **Control Panel**: "Run Audit Now" button (server action)
- **Latest Run Summary**: Stats from the most recent audit cycle
- **Recent Logs Table**: Last 50 audit records with timestamp, brand, region, status, TTFB, cache status

### 7. Configuration Files

#### `config/brands.ts`
Array of monitored brand URLs (currently 10 major sites)

#### `vercel.json`
- Hourly cron schedule: `"0 * * * *"` (every hour at :00)
- Region pinning for each probe route
- 60-second max duration for orchestrator

#### `.env.example`
Template for required environment variables

---

## Setup Instructions

### Prerequisites
- Node.js 18+ installed
- Neon Postgres database created
- Vercel account (for deployment)

### Local Setup

1. **Clone and install dependencies**
   ```bash
   cd global-edge-efficiency-analyser
   npm install
   ```

2. **Configure environment variables**
   ```bash
   # Copy the example file
   cp .env.example .env.local
   
   # Edit .env.local and set:
   # - POSTGRES_URL: Your Neon connection string
   # - CRON_SECRET: A strong random token (generate with: openssl rand -base64 32)
   ```

3. **Initialize the database**
   ```bash
   npm run setup-db
   ```
   
   This creates the `audit_logs` table and indexes.

4. **Start development server**
   ```bash
   npm run dev
   ```
   
   Visit http://localhost:3000 to see the dashboard.

### Deployment to Vercel

1. **Link your Vercel project**
   ```bash
   vercel link
   ```

2. **Set environment variables in Vercel**
   ```bash
   vercel env add POSTGRES_URL
   vercel env add CRON_SECRET
   ```
   
   Or set them via the Vercel dashboard under Project Settings → Environment Variables.

3. **Deploy**
   ```bash
   vercel --prod
   ```

4. **Verify deployment**
   - Check that cron job is registered in Vercel dashboard (Settings → Cron Jobs)
   - Confirm probe routes are deployed to correct regions (check deployment logs)

---

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `POSTGRES_URL` | Neon Postgres connection string | `postgresql://user:pass@host.neon.tech/db?sslmode=require` |
| `CRON_SECRET` | Bearer token for internal API security | `your-secure-random-string-here` |
| `VERCEL_URL` | Auto-populated by Vercel (manual for local dev) | `your-app.vercel.app` or `localhost:3000` |

### Generating a Secure `CRON_SECRET`
```bash
openssl rand -base64 32
```

---

## Running the System

### Manual Audit Trigger (UI)
1. Navigate to your deployed site or http://localhost:3000
2. Click "Run Audit Now" in the Control Panel
3. Wait for page reload - the Latest Run Summary will update

### Manual Audit Trigger (API)
```bash
curl -X GET "https://your-app.vercel.app/api/cron/run-audit" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Response:
```json
{
  "success": true,
  "brands_audited": 10,
  "rows_inserted": 50,
  "errors": []
}
```

### Automated Cron Execution
Once deployed to Vercel:
- Cron runs every hour at the top of the hour (e.g., 1:00, 2:00, 3:00)
- View execution logs in Vercel dashboard → Logs
- Check for cron invocations with path `/api/cron/run-audit`

---

## How It Works

### Audit Cycle Flow

1. **Trigger**: Vercel Cron or manual button click
2. **Orchestrator Start**: `/api/cron/run-audit` receives request
3. **Batch Processing**: 
   - Brands are processed in chunks of 5 to avoid timeout
   - For each brand, generate a unique `request_id` (UUID)
4. **Probe Fan-Out**:
   - Orchestrator calls all 5 probe endpoints in parallel
   - Each probe executes HEAD request from its region
   - Probes measure TTFB and extract headers
5. **Data Collection**:
   - Each probe returns JSON: `{ region, ttfb, status, headers, error? }`
   - Orchestrator collects all 5 responses (success or error)
6. **Database Persistence**:
   - Results are batch-inserted into `audit_logs`
   - Each row includes `request_id` to group the 5 regional probes
7. **Response**: Summary JSON returned to caller

### Security Model

- **Internal API Routes**: All probe endpoints require `Authorization: Bearer <CRON_SECRET>`
- **Cron Endpoint**: Accepts either Vercel's `x-vercel-cron` header or bearer token
- **UI**: Server actions run server-side - no secrets exposed to client

---

## Data Model

### `audit_logs` Table Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Auto-incrementing primary key |
| `request_id` | UUID | Groups the 5 probes for a single brand audit |
| `brand_url` | TEXT | The URL that was audited |
| `region` | TEXT | Region identifier (iad1, lhr1, sfo1, fra1, syd1) |
| `timestamp` | TIMESTAMPTZ | When the probe was executed (defaults to NOW()) |
| `status` | INT | HTTP status code (0 if error/timeout) |
| `ttfb` | INT | Time to First Byte in milliseconds |
| `headers` | JSONB | Extracted cache and CDN headers |
| `error_message` | TEXT | Nullable, captures timeout or fetch errors |

### Indexes
- `idx_audit_logs_timestamp` - Optimizes recent log queries
- `idx_audit_logs_request_id` - Groups probes by audit cycle
- `idx_audit_logs_region` - Filters by region

### Example Query: Average TTFB by Region
```sql
SELECT 
  region,
  AVG(ttfb) as avg_ttfb,
  COUNT(*) as total_probes
FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
  AND error_message IS NULL
GROUP BY region
ORDER BY avg_ttfb ASC;
```

---

## Troubleshooting

### Issue: Database connection fails locally
**Symptom**: Error "POSTGRES_URL environment variable is not set"

**Solution**:
1. Check that `.env.local` exists and contains `POSTGRES_URL`
2. Restart dev server after changing `.env.local`
3. Verify connection string works: `psql $POSTGRES_URL`

---

### Issue: Probe returns 401 Unauthorized
**Symptom**: Audit fails with "Probe X returned 401"

**Solution**:
1. Verify `CRON_SECRET` is set in environment variables
2. Check that orchestrator passes correct header: `Authorization: Bearer <secret>`
3. Ensure probe route reads secret correctly: `process.env.CRON_SECRET`

---

### Issue: Cron job not running on Vercel
**Symptom**: No audit logs appear after deployment

**Solution**:
1. Check Vercel dashboard → Settings → Cron Jobs (should show hourly schedule)
2. Review Vercel deployment logs for cron invocations
3. Manually trigger via API to test: `curl -X GET https://your-app.vercel.app/api/cron/run-audit -H "Authorization: Bearer YOUR_SECRET"`
4. Verify `vercel.json` is in the root of the project

---

### Issue: Probes not pinned to correct regions
**Symptom**: TTFB values are similar across all regions

**Solution**:
1. Check `vercel.json` paths match actual file structure
2. Verify deployment logs show region assignments
3. Note: Region pinning only works on Vercel Pro/Enterprise plans for some regions

---

### Issue: Timeout errors on large brand lists
**Symptom**: Orchestrator times out before completing all brands

**Solution**:
1. Reduce batch size in `lib/services/audit-service.ts` (currently 5)
2. Increase `maxDuration` in `vercel.json` (currently 60 seconds)
3. Consider splitting brand list into multiple smaller lists

---

### Issue: UI shows "No audit logs yet" after running audit
**Symptom**: Audit completes successfully but UI is empty

**Solution**:
1. Check database directly: `SELECT COUNT(*) FROM audit_logs;`
2. Verify `POSTGRES_URL` is correct in production environment
3. Check Vercel logs for database errors during insert
4. Ensure table was created: `npm run setup-db` or check Neon console

---

## Verification Checklist

Use this checklist to verify your deployment:

### Local Development
- [ ] Database table created: `npm run setup-db` runs without errors
- [ ] Environment variables set in `.env.local`
- [ ] Dev server starts: `npm run dev`
- [ ] Dashboard loads at http://localhost:3000
- [ ] "Run Audit Now" button triggers audit successfully
- [ ] Recent logs appear after audit completes

### Production Deployment
- [ ] Environment variables set in Vercel dashboard
- [ ] `vercel.json` present in project root
- [ ] Deployment succeeds without errors
- [ ] Cron job appears in Vercel Settings → Cron Jobs
- [ ] Manual API trigger works: `curl https://your-app.vercel.app/api/cron/run-audit -H "Authorization: Bearer SECRET"`
- [ ] Probe endpoints return 401 without auth: `curl https://your-app.vercel.app/api/probes/iad1?url=https://google.com`
- [ ] Probe endpoints work with auth
- [ ] Dashboard UI loads and shows data
- [ ] Wait 1 hour and verify cron executed (check Vercel logs)

### Data Validation
- [ ] Audit inserts 5 rows per brand (1 per region)
- [ ] All 5 rows share the same `request_id`
- [ ] TTFB values are reasonable (not all 0 or 6000)
- [ ] Headers are captured (JSONB not empty)
- [ ] Error rows have non-null `error_message`

---

## Next Steps (Future Enhancements)

Phase 1 is complete! Potential future additions:

- **Analytics Dashboard**: Charts showing TTFB trends over time
- **Regional Performance Maps**: Visual map of response times
- **Alerting**: Notifications when TTFB exceeds thresholds
- **Brand Management UI**: Add/remove brands without code changes
- **Export Functionality**: Download audit data as CSV
- **Comparative Analysis**: Side-by-side region comparisons
- **Historical Aggregations**: Hourly/daily rollups for long-term trends

---

## Support & Contact

For issues or questions:
- Check Vercel deployment logs
- Review Neon database console for query errors
- Consult Next.js and Vercel documentation for platform-specific issues

---

**Last Updated**: February 2026  
**Version**: Phase 1 (Backend + Minimal UI)
