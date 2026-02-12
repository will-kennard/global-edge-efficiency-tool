import { MONITORED_BRANDS } from '@/config/brands';
import type { ProbeResult } from '@/lib/probe-logic';
import {
  getRecentAuditLogs,
  getLatestRunSummary,
  insertAuditLogs,
  type AuditLogInsertRow,
  type AuditLogRow,
  type RunSummary,
} from '@/lib/data/audit-logs';
import { randomUUID } from 'crypto';

const PROBE_REGIONS = ['iad1', 'lhr1', 'sfo1', 'fra1', 'syd1'] as const;
const BATCH_SIZE = 5;

export interface AuditRunResult {
  success: boolean;
  brands_audited: number;
  rows_inserted: number;
  errors?: string[];
}

export interface DashboardData {
  logs: AuditLogRow[];
  latestRun: RunSummary | null;
}

/**
 * Run a full audit cycle for all monitored brands.
 * Processes brands in batches, probing from all 5 regions simultaneously.
 */
export async function runFullAudit(
  baseUrl: string,
  cronSecret: string
): Promise<AuditRunResult> {
  const brands = [...MONITORED_BRANDS];
  let totalRowsInserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < brands.length; i += BATCH_SIZE) {
    const batch = brands.slice(i, i + BATCH_SIZE);

    try {
      const batchResults = await Promise.all(
        batch.map((brandUrl) => auditBrand(brandUrl, baseUrl, cronSecret))
      );

      const allProbeResults = batchResults.flat();

      if (allProbeResults.length > 0) {
        const rows: AuditLogInsertRow[] = allProbeResults.map((r) => ({
          request_id: r.request_id,
          brand_url: r.brand_url,
          region: r.region,
          status: r.status,
          ttfb: r.ttfb,
          headers: r.headers,
          error_message: r.error ?? null,
        }));
        await insertAuditLogs(rows);
        totalRowsInserted += allProbeResults.length;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Batch ${i / BATCH_SIZE + 1} failed: ${errorMessage}`);
    }
  }

  return {
    success: errors.length === 0,
    brands_audited: brands.length,
    rows_inserted: totalRowsInserted,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Audit a single brand by probing from all 5 regions.
 */
async function auditBrand(
  brandUrl: string,
  baseUrl: string,
  cronSecret: string
): Promise<Array<ProbeResult & { brand_url: string; request_id: string }>> {
  const requestId = randomUUID();

  const probePromises = PROBE_REGIONS.map(async (region) => {
    try {
      const probeUrl = `${baseUrl}/api/probes/${region}?url=${encodeURIComponent(brandUrl)}`;

      const response = await fetch(probeUrl, {
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Probe ${region} returned ${response.status}`);
      }

      const result: ProbeResult = await response.json();

      return {
        ...result,
        brand_url: brandUrl,
        request_id: requestId,
      };
    } catch (error) {
      return {
        region,
        brand_url: brandUrl,
        request_id: requestId,
        ttfb: 0,
        status: 0,
        headers: {},
        error: error instanceof Error ? error.message : 'Probe failed',
      };
    }
  });

  return Promise.all(probePromises);
}

/**
 * Fetch data for the dashboard: recent logs and latest run summary.
 * Runs both queries in parallel.
 */
export async function getDashboardData(options?: {
  logsLimit?: number;
  summaryWithinHours?: number;
}): Promise<DashboardData> {
  const logsLimit = options?.logsLimit ?? 50;
  const summaryWithinHours = options?.summaryWithinHours ?? 2;

  const [logs, latestRun] = await Promise.all([
    getRecentAuditLogs(logsLimit),
    getLatestRunSummary(summaryWithinHours),
  ]);

  return { logs, latestRun };
}
