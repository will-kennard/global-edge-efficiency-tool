# 24-Hour Monitoring Workflow (Vercel WDK)

## Overview

Replace the static Vercel Cron (`vercel.json` schedule) with a UI-triggered, time-bounded monitoring workflow using the [Workflow Development Kit](https://vercel.com/docs/workflow). A user clicks "Start 24h Monitoring" and the system runs a full audit every hour for 24 hours, then stops. No always-on cron, no manual intervention to cancel.

## Why Workflow over Cron

| Concern | Cron (current) | Workflow (proposed) |
|---|---|---|
| Duration | Runs forever once deployed | Runs for exactly 24 hours then stops |
| Control | Edit `vercel.json` to enable/disable | Start/stop from the UI |
| State | Stateless -- each run is independent | Durable -- tracks how many runs remain, survives deploys |
| Retries | None -- if a run fails it's lost | Per-step automatic retries |
| Observability | Basic Vercel function logs | Full step-by-step trace in dashboard |
| Timeout | 60s function limit | No timeout -- `sleep('1 hour')` consumes zero compute |

## Architecture

```
UI Button ("Start 24h Monitoring")
        │
        ▼
  POST /api/workflows/monitor
        │
        ▼
  monitoringWorkflow()        ◄── 'use workflow'
        │
        ├── runAuditStep()    ◄── 'use step' (hour 1)
        │       └── calls existing runFullAudit()
        │
        ├── sleep('1 hour')   ◄── zero compute
        │
        ├── runAuditStep()    ◄── 'use step' (hour 2)
        │       └── calls existing runFullAudit()
        │
        ├── sleep('1 hour')
        │
        │   ... repeats 24 times total ...
        │
        └── return { totalRuns: 24, batchIds: [...] }
```

## Implementation Plan

### 1. Install WDK

```bash
npm i workflow
```

### 2. Create the workflow

New file: `app/workflows/monitor.ts`

Pseudocode structure:

```typescript
import { sleep } from 'workflow';
import { runFullAudit } from '@/lib/services/audit-service';

export async function monitoringWorkflow(config: {
  brands: string[];
  intervalHours: number;
  totalRuns: number;
  baseUrl: string;
  cronSecret: string;
}) {
  'use workflow';

  const batchIds: string[] = [];

  for (let i = 0; i < config.totalRuns; i++) {
    const result = await runAuditStep(config);
    batchIds.push(result.batch_id);

    if (i < config.totalRuns - 1) {
      await sleep(`${config.intervalHours} hour`);
    }
  }

  return { totalRuns: config.totalRuns, batchIds };
}

async function runAuditStep(config: {
  baseUrl: string;
  cronSecret: string;
}) {
  'use step';

  return await runFullAudit(config.baseUrl, config.cronSecret);
}
```

### 3. Create the API route

New file: `app/api/workflows/monitor/route.ts`

- Accepts POST to start a monitoring workflow
- Accepts DELETE to cancel a running workflow
- Returns workflow run ID for tracking

### 4. Add UI controls

In `app/page.tsx`, add a third button to the control panel:

- **"Start 24h Monitoring"** -- triggers the workflow
- Subtitle: "Audits all brands every hour for 24 hours"
- Optionally show active workflow status (running / complete / not started)

### 5. Workflow parameters (configurable via UI later)

| Parameter | Default | Description |
|---|---|---|
| `totalRuns` | 24 | Number of audit cycles |
| `intervalHours` | 1 | Hours between each cycle |
| `brands` | `MONITORED_BRANDS` | Brand list to audit |

### 6. Cron migration

Once the workflow is stable:

- Remove the `crons` block from `vercel.json`
- Remove or repurpose `app/api/cron/run-audit/route.ts`
- All scheduled auditing runs through Workflow

## Compatibility with Phase 2 (Clay + AI)

The same workflow pattern extends naturally into the intelligence pipeline from `clay-features.md`:

```
monitoringWorkflow()
    ├── runAuditStep()           ◄── existing probe logic
    ├── computeScoresStep()      ◄── caching intelligence aggregator
    ├── clayEnrichmentStep()     ◄── Clay API call
    ├── generateReportStep()     ◄── AI SDK / OpenAI call
    └── saveReportStep()         ◄── persist to intelligence_reports table
```

Each step is independently retried and observable. An OpenAI timeout doesn't kill the audit data. A Clay API failure doesn't lose the scores already computed.

---

## Improvements to 24-Hour Feature

Beyond basic TTFB-every-hour, Workflow's durability and multi-step orchestration enable analysis techniques that are impractical with simple cron + single-request probes:

### 1. Cache Warmth Decay Tracking

Run a rapid burst of 3 probes per region at each hour: the first hits cold cache, the second and third measure warm cache. Track how quickly the `age` header resets between hourly runs to detect CDN TTL boundaries and eviction patterns. This reveals whether a site's cache strategy is aggressively short-lived or stable.

### 2. Stale-While-Revalidate Detection

Issue a probe, wait 5 seconds (using `sleep`), then probe again from the same region. Compare `age` headers: if the second probe shows a lower `age` than expected, SWR is active. Most auditing tools can't detect this because they only make a single request.

### 3. Geographic Cache Propagation Timing

After a cache miss in one region, probe all other regions in sequence with short sleeps between them. Measure how long it takes for a cache fill in `iad1` to propagate to `syd1`. This quantifies CDN edge propagation speed -- a metric almost nobody reports.

### 4. Origin Shielding Detection

Probe the same URL from all 5 regions simultaneously, then immediately probe again from all 5. If all second probes show cache hits with similar `age` values, the CDN uses a shared origin shield. If `age` varies by region, each edge node caches independently. This distinction has real cost and performance implications.

### 5. Cache Key Collision Testing

Probe the same URL with and without query parameters (`?v=1`, `?utm_source=test`), different `Accept-Encoding` values, and with/without trailing slashes. Compare whether the CDN returns the same cached response or creates separate cache entries. Misconfigured cache keys are a common cause of low cache hit rates and wasted origin load.

### 6. Time-of-Day Traffic Pattern Analysis

With 24 hourly data points, correlate TTFB and cache hit rates against time of day. Sites with traffic-dependent caching (e.g. eviction under load, or cold caches during off-peak hours) will show clear patterns. This is commercially valuable: "Your cache hit rate drops to 30% between 2-6am UTC, suggesting TTL-based eviction without prewarming."

### 7. TLS Handshake and DNS Overhead Isolation

Extend the probe to measure DNS resolution and TLS handshake time separately from TTFB. Over 24 hours, track whether DNS or TLS contributes disproportionately to total latency. A site with fast TTFB but slow DNS points to a DNS provider issue, not a caching issue -- a distinction that changes the recommendation entirely.

### 8. Redirect Chain Mapping

Instead of `redirect: 'manual'` (current behaviour), follow redirects and record each hop: URL, status code, headers, and timing. Many sites have unnecessary redirect chains (http -> https -> www -> canonical) that add 100-300ms per hop. This is low-hanging fruit for performance improvements and highly actionable in sales outreach.

### 9. Response Body Size Sampling

Periodically switch from HEAD to GET and measure response body size alongside TTFB. Large uncached responses hitting origin every time are an infrastructure cost signal. Correlate body size with cache miss rate to estimate wasted bandwidth.

### 10. Competitive Benchmarking Workflows

Run a monitoring workflow against a target brand and 3-5 competitors in the same industry simultaneously. After 24 hours, generate a comparative report: "Your average TTFB is 340ms vs competitor average of 120ms; your cache hit rate is 45% vs competitor average of 85%." This turns raw data into a sales narrative without any AI.
