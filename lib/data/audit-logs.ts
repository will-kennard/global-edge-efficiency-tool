import { sql } from '@/lib/db';

export interface AuditLogRow {
  id: number;
  batch_id: string;
  request_id: string;
  brand_url: string;
  region: string;
  timestamp: string;
  status: number;
  ttfb: number;
  headers: Record<string, string>;
  error_message: string | null;
}

export interface RunSummary {
  batch_id: string;
  probe_count: number;
  run_time: string;
  brands_count: number;
  error_count: number;
}

export interface BatchSummary {
  batch_id: string;
  run_time: string;
  brands_count: number;
  probe_count: number;
  error_count: number;
}

export interface AuditLogInsertRow {
  batch_id: string;
  request_id: string;
  brand_url: string;
  region: string;
  status: number;
  ttfb: number;
  headers: Record<string, string>;
  error_message?: string | null;
}

/**
 * Fetch recent audit log rows, ordered by timestamp descending.
 */
export async function getRecentAuditLogs(limit = 50): Promise<AuditLogRow[]> {
  try {
    const result = await sql`
      SELECT 
        id,
        batch_id::text,
        request_id::text, 
        brand_url, 
        region, 
        timestamp, 
        status, 
        ttfb, 
        headers, 
        error_message
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;
    return result as AuditLogRow[];
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return [];
  }
}

/**
 * Return summary metadata for recent batches, most recent first.
 */
export async function getRecentBatches(limit = 10): Promise<BatchSummary[]> {
  try {
    const result = await sql`
      SELECT 
        batch_id::text,
        MIN(timestamp)::text as run_time,
        COUNT(DISTINCT brand_url)::int as brands_count,
        COUNT(*)::int as probe_count,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END)::int as error_count
      FROM audit_logs
      GROUP BY batch_id
      ORDER BY MIN(timestamp) DESC
      LIMIT ${limit}
    `;
    return result as BatchSummary[];
  } catch (error) {
    console.error('Failed to fetch recent batches:', error);
    return [];
  }
}

/**
 * Fetch all audit log rows for a specific batch.
 */
export async function getLogsByBatchId(batchId: string): Promise<AuditLogRow[]> {
  try {
    const result = await sql`
      SELECT 
        id,
        batch_id::text,
        request_id::text,
        brand_url,
        region,
        timestamp,
        status,
        ttfb,
        headers,
        error_message
      FROM audit_logs
      WHERE batch_id = ${batchId}::uuid
      ORDER BY brand_url, region
    `;
    return result as AuditLogRow[];
  } catch (error) {
    console.error('Failed to fetch logs by batch:', error);
    return [];
  }
}

/**
 * Fetch the latest audit run summary, grouped by batch_id.
 */
export async function getLatestRunSummary(withinHours = 24): Promise<RunSummary | null> {
  try {
    const result = await sql`
      SELECT 
        batch_id::text,
        COUNT(*)::int as probe_count,
        MIN(timestamp)::text as run_time,
        COUNT(DISTINCT brand_url)::int as brands_count,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END)::int as error_count
      FROM audit_logs
      WHERE timestamp > NOW() - make_interval(hours => ${withinHours})
      GROUP BY batch_id
      ORDER BY MIN(timestamp) DESC
      LIMIT 1
    `;

    if (result.length > 0) {
      return result[0] as RunSummary;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch latest run summary:', error);
    return null;
  }
}

export async function insertAuditLogs(rows: AuditLogInsertRow[]): Promise<void> {
  for (const row of rows) {
    const headersJson = typeof row.headers === 'string' ? row.headers : JSON.stringify(row.headers);
    await sql`
      INSERT INTO audit_logs (
        batch_id,
        request_id, 
        brand_url, 
        region, 
        status, 
        ttfb, 
        headers, 
        error_message
      )
      VALUES (
        ${row.batch_id},
        ${row.request_id},
        ${row.brand_url},
        ${row.region},
        ${row.status},
        ${row.ttfb},
        ${headersJson},
        ${row.error_message ?? null}
      )
    `;
  }
}
