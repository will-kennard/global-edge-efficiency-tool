import { MONITORED_BRANDS } from '@/config/brands';
import type { ProbeResult } from '@/lib/probe-logic';
import {
  getRecentBatches,
  getLogsByBatchId,
  getLatestRunSummary,
  insertAuditLogs,
  type AuditLogInsertRow,
  type AuditLogRow,
  type RunSummary,
  type BatchSummary,
} from '@/lib/data/audit-logs';
import { randomUUID } from 'crypto';

const PROBE_REGIONS = ['iad1', 'lhr1', 'sfo1', 'fra1', 'syd1'] as const;
const BATCH_SIZE = 5;

export interface AuditRunResult {
  success: boolean;
  batch_id: string;
  brands_audited: number;
  rows_inserted: number;
  errors?: string[];
}

export interface DashboardData {
  batches: BatchSummary[];
  logs: AuditLogRow[];
  latestRun: RunSummary | null;
}

/**
 * Run a full audit cycle for all monitored brands.
 * Generates a single batch_id for the entire run.
 */
export async function runFullAudit(
  baseUrl: string,
  cronSecret: string
): Promise<AuditRunResult> {
  const batchId = randomUUID();
  const brands = [...MONITORED_BRANDS];
  let totalRowsInserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < brands.length; i += BATCH_SIZE) {
    const batch = brands.slice(i, i + BATCH_SIZE);

    try {
      const batchResults = await Promise.all(
        batch.map((brandUrl) => auditBrand(brandUrl, batchId, baseUrl, cronSecret))
      );

      const allProbeResults = batchResults.flat();

      if (allProbeResults.length > 0) {
        const rows: AuditLogInsertRow[] = allProbeResults.map((r) => ({
          batch_id: batchId,
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
    batch_id: batchId,
    brands_audited: brands.length,
    rows_inserted: totalRowsInserted,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Run an audit for a single brand from all 5 regions.
 * Creates its own batch_id so the run is self-contained.
 */
export async function runSingleBrandAudit(
  brandUrl: string,
  baseUrl: string,
  cronSecret: string
): Promise<AuditRunResult> {
  const batchId = randomUUID();
  const errors: string[] = [];
  let rowsInserted = 0;

  try {
    const probeResults = await auditBrand(brandUrl, batchId, baseUrl, cronSecret);

    if (probeResults.length > 0) {
      const rows: AuditLogInsertRow[] = probeResults.map((r) => ({
        batch_id: batchId,
        request_id: r.request_id,
        brand_url: r.brand_url,
        region: r.region,
        status: r.status,
        ttfb: r.ttfb,
        headers: r.headers,
        error_message: r.error ?? null,
      }));
      await insertAuditLogs(rows);
      rowsInserted = probeResults.length;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMessage);
  }

  return {
    success: errors.length === 0,
    batch_id: batchId,
    brands_audited: 1,
    rows_inserted: rowsInserted,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Audit a single brand by probing from all 5 regions.
 */
async function auditBrand(
  brandUrl: string,
  batchId: string,
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
 * Fetch data for the dashboard: recent batches, logs for a selected batch,
 * and the latest run summary.
 */
export async function getDashboardData(options?: {
  batchId?: string;
  batchesLimit?: number;
  summaryWithinHours?: number;
}): Promise<DashboardData> {
  const batchesLimit = options?.batchesLimit ?? 10;
  const summaryWithinHours = options?.summaryWithinHours ?? 24;

  const [batches, latestRun] = await Promise.all([
    getRecentBatches(batchesLimit),
    getLatestRunSummary(summaryWithinHours),
  ]);

  // If a specific batch was requested use that, otherwise use the most recent
  const selectedBatchId = options?.batchId ?? batches[0]?.batch_id;
  const logs = selectedBatchId ? await getLogsByBatchId(selectedBatchId) : [];

  return { batches, logs, latestRun };
}
