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
- **Single Brand Testing** - Dedicated endpoint and config for testing one brand at a time
- **Minimal UI** - Dashboard with batch selector, manual triggers, and filtered results

### Request Flow

```
┌─────────────┐     ┌───────────────┐
│ Vercel Cron │     │ Single Brand  │
│  or Manual  │     │    Test       │
└──────┬──────┘     └──────┬────────┘
       │                   │
       ▼                   ▼
┌──────────────┐   ┌───────────────┐
│ run-audit    │   │ single-brand  │     Each run generates
│ (full)       │   │ (one brand)   │ ──▶ a unique batch_id
└──────┬───────┘   └──────┬────────┘
       │                  │
       └────────┬─────────┘
                │
       ┌────────┴────────┬─────────┬─────────┐
       ▼        ▼        ▼         ▼         ▼
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
- `getRecentBatches(limit?)` - fetch recent batch summaries grouped by `batch_id`
- `getLogsByBatchId(batchId)` - fetch all rows for a specific batch
- `getLatestRunSummary(withinHours?)` - latest run aggregates grouped by `batch_id`
- `getRecentAuditLogs(limit?)` - fetch recent rows (legacy, not used by dashboard)
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
- `runFullAudit()` - processes all brands from `config/brands.ts` in batches of 5
- `runSingleBrandAudit()` - audits a single brand from all 5 regions (for testing or customer audits)
- Generates a `batch_id` (UUID) per audit run to group all results from that run
- Within each batch, generates a `request_id` (UUID) per brand to group the 5 regional probes
- Flattens results and performs batch inserts into `audit_logs`
- `getDashboardData()` - fetches recent batches, logs for a selected batch, and latest run summary
- Returns summary: batch_id, brands audited, rows inserted, errors

### 5. Cron Endpoint (`app/api/cron/run-audit/route.ts`)
- Entry point for scheduled and manual full audits
- Accepts either:
  - Vercel cron header (`x-vercel-cron`)
  - Bearer token authorization for manual triggers
- Constructs base URL for self-referencing probe calls
- Invokes `runFullAudit()` and returns JSON summary

### 5b. Single-Brand Endpoint (`app/api/audit/single-brand/route.ts`)
- Entry point for single-brand audits (testing or customer use)
- Accepts bearer token authorization
- Optionally accepts `?url=` query parameter; defaults to `SINGLE_BRAND_URL` from config
- Invokes `runSingleBrandAudit()` and returns JSON summary

### 6. Dashboard UI (`app/page.tsx`)
Server-rendered page with:
- **Control Panel**: "Run Full Audit" button and "Test Single Brand" button (server actions)
- **Latest Run Summary**: Stats from the most recent audit cycle (grouped by batch)
- **Batch Selector**: Clickable pills showing recent batches with metadata (timestamp, brand count, probe count, errors)
- **Filtered Logs Table**: Audit records for the selected batch, with timestamp, brand, region, status, TTFB, cache status
- Batch selection uses URL search params (`?batch=<id>`) for server-rendered navigation

### 7. Configuration Files

#### `config/brands.ts`
Array of monitored brand URLs (currently 10 major sites)

#### `config/single-brand.ts`
Single brand URL for testing or customer-specific audits (edit this file to change the target)

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

### Manual Full Audit (UI)
1. Navigate to your deployed site or http://localhost:3000
2. Click "Run Full Audit" in the Control Panel
3. Wait for page reload - the Latest Run Summary and Batch Selector will update

### Single Brand Test (UI)
1. Edit `config/single-brand.ts` to set the brand URL you want to test
2. Click "Test Single Brand" in the Control Panel
3. The batch will appear in the Batch Selector with 1 brand and 5 probes

### Manual Audit Trigger (API)

**Full audit** (all brands):
```bash
curl -X GET "https://your-app.vercel.app/api/cron/run-audit" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Single brand** (uses configured URL or custom `?url=` param):
```bash
curl -X GET "https://your-app.vercel.app/api/audit/single-brand" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Or with a custom URL:
curl -X GET "https://your-app.vercel.app/api/audit/single-brand?url=https://example.com" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Response (both endpoints):
```json
{
  "success": true,
  "batch_id": "a1b2c3d4-...",
  "brands_audited": 10,
  "rows_inserted": 50
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

1. **Trigger**: Vercel Cron, manual "Run Full Audit" button, or "Test Single Brand" button
2. **Batch ID**: A unique `batch_id` (UUID) is generated to group the entire run
3. **Orchestrator Start**: `/api/cron/run-audit` (full) or `/api/audit/single-brand` (single) receives request
4. **Brand Processing**: 
   - Full audit: brands are processed in chunks of 5 to avoid timeout
   - Single brand: one brand is processed immediately
   - For each brand, generate a unique `request_id` (UUID) to group its 5 regional probes
5. **Probe Fan-Out**:
   - Orchestrator calls all 5 probe endpoints in parallel per brand
   - Each probe executes HEAD request from its region
   - Probes measure TTFB and extract headers
6. **Data Collection**:
   - Each probe returns JSON: `{ region, ttfb, status, headers, error? }`
   - Orchestrator collects all 5 responses (success or error)
7. **Database Persistence**:
   - Results are batch-inserted into `audit_logs`
   - Each row includes both `batch_id` (run-level grouping) and `request_id` (brand-level grouping)
8. **Response**: Summary JSON with `batch_id` returned to caller

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
| `batch_id` | UUID | Groups all probes from a single audit run (full or single-brand) |
| `request_id` | UUID | Groups the 5 regional probes for a single brand within a batch |
| `brand_url` | TEXT | The URL that was audited |
| `region` | TEXT | Region identifier (iad1, lhr1, sfo1, fra1, syd1) |
| `timestamp` | TIMESTAMPTZ | When the probe was executed (defaults to NOW()) |
| `status` | INT | HTTP status code (0 if error/timeout) |
| `ttfb` | INT | Time to First Byte in milliseconds |
| `headers` | JSONB | Extracted cache and CDN headers |
| `error_message` | TEXT | Nullable, captures timeout or fetch errors |

### Indexes
- `idx_audit_logs_timestamp` - Optimizes recent log queries
- `idx_audit_logs_batch_id` - Groups probes by audit run
- `idx_audit_logs_request_id` - Groups probes by brand within a run
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
- [ ] "Run Full Audit" button triggers audit successfully
- [ ] "Test Single Brand" button triggers single-brand audit successfully
- [ ] Batch selector appears and shows completed batches
- [ ] Clicking a batch shows its logs in the table

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
- [ ] Full audit inserts 5 rows per brand (1 per region)
- [ ] All rows from one audit run share the same `batch_id`
- [ ] All 5 rows for one brand share the same `request_id`
- [ ] Single-brand audit inserts exactly 5 rows with 1 `batch_id` and 1 `request_id`
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
