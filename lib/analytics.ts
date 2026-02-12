import { sql } from '@/lib/db';

export type TrendWindow = '1h' | '24h' | '7d' | '30d';

const WINDOW_INTERVALS: Record<TrendWindow, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export interface RegionMetric {
  region: string;
  avgTtfb: number;
  probeCount: number;
  errorCount: number;
}

export interface CacheHitMetric {
  groupKey: string;
  totalProbes: number;
  hitCount: number;
  hitRate: number;
}

export interface TrendPoint {
  bucketStart: string;
  value: number;
  probeCount: number;
}

export interface BrandSummary {
  brandUrl: string;
  avgTtfb: number;
  probeCount: number;
  errorCount: number;
  cacheHitRate: number;
}

export interface RunSummary {
  requestId: string;
  runTime: string;
  probeCount: number;
  brandsCount: number;
  errorCount: number;
}

export interface RegionComparisonInput {
  window?: TrendWindow;
  brandUrl?: string;
}

export interface CacheHitProxyInput {
  window?: TrendWindow;
  groupBy?: 'region' | 'brand';
}

export interface TrendInput {
  window: TrendWindow;
  bucket?: 'hour' | 'day';
  metric?: 'ttfb' | 'error_rate' | 'probe_count';
}

export interface BrandSummaryInput {
  window?: TrendWindow;
  brandUrls?: string[];
}

export interface RunHistoryInput {
  limit?: number;
  since?: string;
}

/**
 * Get regional metrics (avg TTFB, probe count, error count) for analysis pages.
 */
export async function getRegionalMetrics(
  input?: RegionComparisonInput
): Promise<RegionMetric[]> {
  const window = input?.window ?? '24h';
  const interval = WINDOW_INTERVALS[window];

  const result = input?.brandUrl
    ? await sql`
        SELECT 
          region,
          COALESCE(AVG(ttfb) FILTER (WHERE error_message IS NULL), 0)::int as avg_ttfb,
          COUNT(*)::int as probe_count,
          COUNT(*) FILTER (WHERE error_message IS NOT NULL)::int as error_count
        FROM audit_logs
        WHERE timestamp > NOW() - (${interval})::interval
          AND brand_url = ${input.brandUrl}
        GROUP BY region
        ORDER BY avg_ttfb ASC
      `
    : await sql`
        SELECT 
          region,
          COALESCE(AVG(ttfb) FILTER (WHERE error_message IS NULL), 0)::int as avg_ttfb,
          COUNT(*)::int as probe_count,
          COUNT(*) FILTER (WHERE error_message IS NOT NULL)::int as error_count
        FROM audit_logs
        WHERE timestamp > NOW() - (${interval})::interval
        GROUP BY region
        ORDER BY avg_ttfb ASC
      `;

  const rows = result as { region: string; avg_ttfb: number; probe_count: number; error_count: number }[];
  return rows.map((r) => ({
    region: r.region,
    avgTtfb: Number(r.avg_ttfb),
    probeCount: Number(r.probe_count),
    errorCount: Number(r.error_count),
  }));
}

/**
 * Get cache hit rate proxy from CDN headers.
 */
export async function getCacheHitRates(
  input?: CacheHitProxyInput
): Promise<CacheHitMetric[]> {
  const window = input?.window ?? '24h';
  const groupBy = input?.groupBy ?? 'region';
  const interval = WINDOW_INTERVALS[window];

  const result =
    groupBy === 'brand'
      ? await sql`
          WITH base AS (
            SELECT 
              brand_url::text as group_key,
              COUNT(*)::int as total,
              COUNT(*) FILTER (
                WHERE 
                  (headers->>'cf-cache-status') IN ('HIT', 'REVALIDATED')
                  OR (headers->>'x-vercel-cache') = 'HIT'
                  OR (headers->>'x-cache') ILIKE '%HIT%'
              )::int as hits
            FROM audit_logs
            WHERE timestamp > NOW() - (${interval})::interval
              AND error_message IS NULL
            GROUP BY brand_url
          )
          SELECT 
            group_key,
            total as total_probes,
            hits as hit_count,
            CASE WHEN total > 0 THEN hits::float / total ELSE 0 END as hit_rate
          FROM base
          ORDER BY hit_rate ASC
        `
      : await sql`
          WITH base AS (
            SELECT 
              region::text as group_key,
              COUNT(*)::int as total,
              COUNT(*) FILTER (
                WHERE 
                  (headers->>'cf-cache-status') IN ('HIT', 'REVALIDATED')
                  OR (headers->>'x-vercel-cache') = 'HIT'
                  OR (headers->>'x-cache') ILIKE '%HIT%'
              )::int as hits
            FROM audit_logs
            WHERE timestamp > NOW() - (${interval})::interval
              AND error_message IS NULL
            GROUP BY region
          )
          SELECT 
            group_key,
            total as total_probes,
            hits as hit_count,
            CASE WHEN total > 0 THEN hits::float / total ELSE 0 END as hit_rate
          FROM base
          ORDER BY hit_rate ASC
        `;

  const rows = result as { group_key: string; total_probes: number; hit_count: number; hit_rate: number }[];
  return rows.map((r) => ({
    groupKey: r.group_key,
    totalProbes: Number(r.total_probes),
    hitCount: Number(r.hit_count),
    hitRate: Number(r.hit_rate),
  }));
}

/**
 * Get time-series trend data for charts.
 */
export async function getTrendSeries(input: TrendInput): Promise<TrendPoint[]> {
  const interval = WINDOW_INTERVALS[input.window];
  const bucket = input.bucket ?? (input.window === '7d' || input.window === '30d' ? 'day' : 'hour');
  const metric = input.metric ?? 'ttfb';
  const dateTrunc = bucket === 'hour' ? 'hour' : 'day';

  let result;
  if (metric === 'ttfb') {
    result = await sql`
      SELECT 
        date_trunc(${dateTrunc}, timestamp)::text as bucket_start,
        COALESCE(AVG(ttfb) FILTER (WHERE error_message IS NULL), 0)::int as value,
        COUNT(*)::int as probe_count
      FROM audit_logs
      WHERE timestamp > NOW() - (${interval})::interval
      GROUP BY date_trunc(${dateTrunc}, timestamp)
      ORDER BY bucket_start ASC
    `;
  } else if (metric === 'error_rate') {
    result = await sql`
      SELECT 
        date_trunc(${dateTrunc}, timestamp)::text as bucket_start,
        (COUNT(*) FILTER (WHERE error_message IS NOT NULL)::float / NULLIF(COUNT(*), 0)) as value,
        COUNT(*)::int as probe_count
      FROM audit_logs
      WHERE timestamp > NOW() - (${interval})::interval
      GROUP BY date_trunc(${dateTrunc}, timestamp)
      ORDER BY bucket_start ASC
    `;
  } else {
    result = await sql`
      SELECT 
        date_trunc(${dateTrunc}, timestamp)::text as bucket_start,
        COUNT(*)::int as value,
        COUNT(*)::int as probe_count
      FROM audit_logs
      WHERE timestamp > NOW() - (${interval})::interval
      GROUP BY date_trunc(${dateTrunc}, timestamp)
      ORDER BY bucket_start ASC
    `;
  }

  const rows = result as { bucket_start: string; value: number; probe_count: number }[];
  return rows.map((r) => ({
    bucketStart: r.bucket_start,
    value: Number(r.value),
    probeCount: Number(r.probe_count),
  }));
}

/**
 * Get brand-level summaries for brand overview pages.
 */
export async function getBrandSummaries(
  input?: BrandSummaryInput
): Promise<BrandSummary[]> {
  const window = input?.window ?? '24h';
  const interval = WINDOW_INTERVALS[window];

  let query;
  if (input?.brandUrls && input.brandUrls.length > 0) {
    query = sql`
      SELECT 
        brand_url,
        COALESCE(AVG(ttfb) FILTER (WHERE error_message IS NULL), 0)::int as avg_ttfb,
        COUNT(*)::int as probe_count,
        COUNT(*) FILTER (WHERE error_message IS NOT NULL)::int as error_count,
        COUNT(*) FILTER (
          WHERE (headers->>'cf-cache-status') IN ('HIT','REVALIDATED')
            OR (headers->>'x-vercel-cache') = 'HIT'
        )::float / NULLIF(COUNT(*), 0) as cache_hit_rate
      FROM audit_logs
      WHERE timestamp > NOW() - (${interval})::interval
        AND brand_url = ANY(${input.brandUrls})
      GROUP BY brand_url
      ORDER BY avg_ttfb ASC
    `;
  } else {
    query = sql`
      SELECT 
        brand_url,
        COALESCE(AVG(ttfb) FILTER (WHERE error_message IS NULL), 0)::int as avg_ttfb,
        COUNT(*)::int as probe_count,
        COUNT(*) FILTER (WHERE error_message IS NOT NULL)::int as error_count,
        COUNT(*) FILTER (
          WHERE (headers->>'cf-cache-status') IN ('HIT','REVALIDATED')
            OR (headers->>'x-vercel-cache') = 'HIT'
        )::float / NULLIF(COUNT(*), 0) as cache_hit_rate
      FROM audit_logs
      WHERE timestamp > NOW() - (${interval})::interval
      GROUP BY brand_url
      ORDER BY avg_ttfb ASC
    `;
  }

  const result = await query;

  const rows = result as {
    brand_url: string;
    avg_ttfb: number;
    probe_count: number;
    error_count: number;
    cache_hit_rate: number;
  }[];
  return rows.map((r) => ({
    brandUrl: r.brand_url,
    avgTtfb: Number(r.avg_ttfb),
    probeCount: Number(r.probe_count),
    errorCount: Number(r.error_count),
    cacheHitRate: Number(r.cache_hit_rate ?? 0),
  }));
}

/**
 * Get run history for run-level views.
 */
export async function getRunHistory(
  input?: RunHistoryInput
): Promise<RunSummary[]> {
  const limit = input?.limit ?? 20;

  let result;
  if (input?.since) {
    result = await sql`
      SELECT 
        request_id::text as request_id,
        MIN(timestamp)::text as run_time,
        COUNT(*)::int as probe_count,
        COUNT(DISTINCT brand_url)::int as brands_count,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END)::int as error_count
      FROM audit_logs
      WHERE timestamp >= ${input.since}::timestamptz
      GROUP BY request_id
      ORDER BY MIN(timestamp) DESC
      LIMIT ${limit}
    `;
  } else {
    result = await sql`
      SELECT 
        request_id::text as request_id,
        MIN(timestamp)::text as run_time,
        COUNT(*)::int as probe_count,
        COUNT(DISTINCT brand_url)::int as brands_count,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END)::int as error_count
      FROM audit_logs
      GROUP BY request_id
      ORDER BY MIN(timestamp) DESC
      LIMIT ${limit}
    `;
  }

  const rows = result as {
    request_id: string;
    run_time: string;
    probe_count: number;
    brands_count: number;
    error_count: number;
  }[];
  return rows.map((r) => ({
    requestId: r.request_id,
    runTime: r.run_time,
    probeCount: Number(r.probe_count),
    brandsCount: Number(r.brands_count),
    errorCount: Number(r.error_count),
  }));
}
