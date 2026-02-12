import { sql } from '@/lib/db';

/**
 * Row shape returned from audit_logs SELECT queries.
 * timestamp comes back as ISO string from Postgres.
 */
export interface AuditLogRow {
  id: number;
  request_id: string;
  brand_url: string;
  region: string;
  timestamp: string;
  status: number;
  ttfb: number;
  headers: Record<string, string>;
  error_message: string | null;
}

/**
 * Summary shape for a single audit run (grouped by request_id).
 */
export interface RunSummary {
  request_id: string;
  probe_count: number;
  run_time: string;
  brands_count: number;
  error_count: number;
}

/**
 * Fetch recent audit log rows, ordered by timestamp descending.
 */
export async function getRecentAuditLogs(limit = 50): Promise<AuditLogRow[]> {
  try {
    const result = await sql`
      SELECT 
        id, 
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
 * Fetch the latest audit run summary within a time window.
 */
export async function getLatestRunSummary(withinHours = 2): Promise<RunSummary | null> {
  try {
    const result = await sql`
      SELECT 
        request_id::text,
        COUNT(*)::int as probe_count,
        MIN(timestamp)::text as run_time,
        COUNT(DISTINCT brand_url)::int as brands_count,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END)::int as error_count
      FROM audit_logs
      WHERE timestamp > NOW() - make_interval(hours => ${withinHours})
      GROUP BY request_id
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

/**
 * Insert audit log rows in batch.
 * Accepts probe result rows with brand_url, request_id, and probe fields.
 */
export interface AuditLogInsertRow {
  request_id: string;
  brand_url: string;
  region: string;
  status: number;
  ttfb: number;
  headers: Record<string, string>;
  error_message?: string | null;
}

export async function insertAuditLogs(rows: AuditLogInsertRow[]): Promise<void> {
  for (const row of rows) {
    const headersJson = typeof row.headers === 'string' ? row.headers : JSON.stringify(row.headers);
    await sql`
      INSERT INTO audit_logs (
        request_id, 
        brand_url, 
        region, 
        status, 
        ttfb, 
        headers, 
        error_message
      )
      VALUES (
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
