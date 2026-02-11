# Strategy Brief for Stakeholders

**Summary**

This is how your edge responds when a browser asks for content.

This system captures **delivery performance, not render performance.**

It answers “how efficiently content is delivered globally,” not “how fast a page visually renders.”

</aside>

### 1. Executive Summary

We are building a proprietary auditing engine to generate the **"2026 Global Edge Efficiency Report."** This data will serve two primary purposes:

1. **The "Hook" for Lead Generation:** Identifying enterprise brands with expensive "Edge Neglect" (slow international performance) to pitch technical auditing services.
2. **Conference Content:** Providing exclusive data for the "Caching as a Competitive Advantage" talk, proving how different architectures (Headless vs. Monolith) perform in the real world.

### 2. The Methodology

We will simulate a global user base accessing 50+ major e-commerce and SaaS sites. Unlike standard audits (which often run from a single US location), this study detects "Geographic Drift"—where a site is fast in London but unusable in Sydney.

- **The "User":** We emulate a standard Chrome browser (modern User Agent) to avoid bot detection and ensure we receive the same payload as a real customer.
- **The Locations:**
    1. **London (LHR1):** Core UK/EU baseline.
    2. **Washington DC (IAD1):** US East / "Center of the Internet."
    3. **San Francisco (SFO1):** US Tech/West Coast.
    4. **Frankfurt (FRA1):** Central Europe (GDPR/Data sovereignty hub).
    5. **Sydney (SYD1):** The "Stress Test." (High latency sensitivity; reveals poor CDN configuration).
- **The Frequency:**
    - **Pulse:** Hourly for 24 hours.
    - **Goal:** Capture "Cache Eviction Cycles" (e.g., does the site slow down every 4 hours when the cache clears? Does it stay fast during peak traffic?).

### **What This Study Measures (and What It Does Not)**

This study is intentionally focused on **edge and origin behaviour**, not full page rendering or user-perceived interactivity.

We measure **Time to First Byte (TTFB)** using real browser headers to understand *where computation happens* and *how effectively responses are cached globally*.

We do **not** measure Core Web Vitals, JavaScript execution time, or visual completeness. Those metrics describe front-end experience; this study isolates **infrastructure efficiency and cache strategy**.

This distinction matters because many international performance issues occur *before* rendering begins — at the CDN, edge, or origin layer.

### 3. Key Metrics & Success Indicators

We aren't just checking "Is it up?" We are fingerprinting their infrastructure:

- **Edge Efficiency Score:** Do all 5 regions serve a "HIT" from the cache?
- **Latency Gap:** What is the TTFB (Time to First Byte) delta between London and Sydney?
- **Edge Stability:**
    - Measures how consistent performance is over time within each region.
    - We calculate this using TTFB variance and percentile spread across 24 hours.
    - High instability indicates cache eviction cycles, origin bottlenecks, or region-specific load sensitivity - even if average performance appears acceptable.
- **Technology Fingerprint:** Identify if they are using Vercel, Cloudflare, Akamai, or legacy hosting based on specific header signatures.
- **"Freshness Debt"**
    - The difference in cache age (Age header) served to users in different regions. As a working benchmark:
        - **Low risk:** < 5 minutes variance
        - **Moderate risk:** 5–30 minutes variance
        - **High risk:** > 30 minutes variance. Persistent freshness debt indicates uneven cache invalidation or regional revalidation lag.

---

## Part 2: Technical Specification (For Cursor / Developers)

**Objective:** Build a serverless, distributed auditing system on Vercel that runs automatically and stores data in Postgres.

### 1. System Architecture

- **Runtime:** Next.js (App Router) on Vercel.
- **Database:** Vercel Postgres (Serverless SQL).
- **Probes:** 5 distinct Edge Functions, each pinned to a specific geographic region.
- **Orchestrator:** A Vercel Cron Job that triggers the probes hourly.

### 2. Database Schema (Postgres)

Create a table named `audit_logs` to store the time-series data.

SQL

`CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  brand_name TEXT NOT NULL,
  brand_url TEXT NOT NULL,
  region TEXT NOT NULL, -- e.g., 'syd1', 'iad1'
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  status INT NOT NULL, -- HTTP Status Code
  ttfb INT NOT NULL, -- Time to First Byte in ms
  cache_status TEXT, -- Normalized status (HIT, MISS, STALE)
  headers JSONB, -- Full dump of response headers
  error_message TEXT -- Nullable, for timeouts/failures
);`

### 3. Component A: The "Probes" (Edge Functions)

We need 5 API routes. They share the same logic but are deployed to different regions.

**Endpoint Paths:**

- `/api/probes/iad1`
- `/api/probes/lhr1`
- `/api/probes/sfo1`
- `/api/probes/fra1`
- `/api/probes/syd1`

**Function Logic (TypeScript):**

1. **Security Gate:** Check `request.headers.get('Authorization')` against `process.env.CRON_SECRET`. Return 401 if invalid.
2. **Input:** `?url=` query parameter.
3. **Execution:**
    - Perform a `fetch(url, { method: 'HEAD', ... })`.
    - **User Agent:** `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...`
    - **Timeout:** Abort after 6000ms (6 seconds).
4. **Data Extraction:**
    - `ttfb`: Measure `performance.now()` delta.
    - `headers`: Extract specific "fingerprint" headers:
        - *Standard:* `cache-control`, `age`, `vary`, `etag`, `last-modified`, `server`, `date`.
        - *CDN Specific:* `cf-cache-status`, `cf-ray` (Cloudflare), `x-vercel-cache` (Vercel), `x-cache`, `x-cache-hits`, `x-served-by` (Fastly/Akamai), `server-timing`.
5. **Output:** Return JSON with `{ region: 'syd1', ttfb, status, headers, ... }`.

### 4. Component B: The "Orchestrator" (Cron Job)

**Endpoint:** `/api/cron/run-audit`

**Logic:**

1. **Source:** Read a list of 50 target URLs (from a local `brands.ts` config file or a `monitored_brands` DB table).
2. **Batching:** Process in chunks of 5 to avoid timeouts.
3. **The "Fan-Out":** For each URL, fire 5 simultaneous requests to *our own* Probe Endpoints (Component A).
    - *Note:* Pass the `Authorization` header in these internal requests.
4. **Persistence:**
    - Await the JSON response from all 5 probes.
    - `INSERT` the results into the `audit_logs` Postgres table.

### 5. Configuration (`vercel.json`)

This is critical for the "Region Pinning" to work.

JSON

`{
  "crons": [
    {
      "path": "/api/cron/run-audit",
      "schedule": "0 * * * *"
    }
  ],
  "functions": {
    "api/probes/syd1/route.ts": { "regions": ["syd1"] },
    "api/probes/iad1/route.ts": { "regions": ["iad1"] },
    "api/probes/lhr1/route.ts": { "regions": ["lhr1"] },
    "api/probes/fra1/route.ts": { "regions": ["fra1"] },
    "api/probes/sfo1/route.ts": { "regions": ["sfo1"] }
  }
}`

---

## Part 3: Data Analysis (SQL Queries)

Once the data is in Vercel Postgres, use these queries to extract the insights for your talk.

### Query 1A: The "Latency Lottery" (Global Consistency)

*Finds brands that are fast in London/US but broken in Sydney.*

```sql
SELECT 
  brand_name,
  AVG(CASE WHEN region = 'lhr1' THEN ttfb END) as london_avg,
  AVG(CASE WHEN region = 'iad1' THEN ttfb END) as us_avg,
  AVG(CASE WHEN region = 'syd1' THEN ttfb END) as sydney_avg,
  (AVG(CASE WHEN region = 'syd1' THEN ttfb END) - AVG(CASE WHEN region = 'lh 1' THEN ttfb END)) as lag_penalty
FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY brand_name
ORDER BY lag_penalty DESC
LIMIT 10;
```

- **Insight:** "Brand X is 2.5 seconds slower in Sydney than London. They are losing the APAC market."

### Query 1B: Edge Stability Analysis Query

```sql
SELECT
  brand_name,
  region,
  AVG(ttfb) as avg_ttfb,
  STDDEV(ttfb) as ttfb_variance,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ttfb) as p90_ttfb
FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY brand_name, region
ORDER BY ttfb_variance DESC;
```

### Query 2: The "Cache Miss" Offenders

*Identifies brands that rarely serve from the Edge.*

```sql
SELECT 
  brand_name,
  region,
  COUNT(*) as total_requests,
  SUM(CASE 
    WHEN headers->>'cf-cache-status' IN ('HIT', 'REVALIDATED') THEN 1
    WHEN headers->>'x-vercel-cache' = 'HIT' THEN 1
    WHEN headers->>'x-cache' LIKE '%HIT%' THEN 1
    ELSE 0 
  END) as cache_hits
FROM audit_logs
GROUP BY brand_name, region
HAVING count(*) > 10
ORDER BY cache_hits ASC
LIMIT 10;
```

- **Insight:** "These 5 Enterprise retailers have a 0% Cache Hit rate in Frankfurt."

### Query 3: The "SWR" Adoption Check

*Checks which brands are actually using modern `stale-while-revalidate` directives.*

```sql
SELECT 
  brand_name,
  CASE 
    WHEN headers->>'cache-control' LIKE '%stale-while-revalidate%' THEN 'Modern (SWR)'
    WHEN headers->>'cache-control' LIKE '%no-store%' THEN 'Uncached'
    ELSE 'Traditional' 
  END as strategy,
  AVG(ttfb) as avg_speed
FROM audit_logs
WHERE region = 'iad1'
GROUP BY brand_name, strategy
ORDER BY avg_speed ASC;
```

- **Insight:** "Brands using SWR are, on average, 400ms faster than those using standard caching."

---

## Part 4: Implementation Checklist

1. **Setup:**
    - [ ]  Create new Vercel Project.
    - [ ]  Add Vercel Postgres storage.
    - [ ]  Define `CRON_SECRET` in Environment Variables.
2. **Code:**
    - [ ]  Scaffold Next.js app.
    - [ ]  Copy "Probe" logic into 5 region files.
    - [ ]  Write "Orchestrator" Cron logic.
    - [ ]  Create `brands.ts` list.
3. **Deploy:**
    - [ ]  Push to GitHub -> Vercel.
    - [ ]  Verify `vercel.json` regions are respected in Vercel Dashboard.
4. **Test:**
    - [ ]  Manually trigger `/api/cron/run-audit` once to populate initial data.
    - [ ]  Check Postgres logs to confirm 250 rows (50 brands * 5 regions) were added.