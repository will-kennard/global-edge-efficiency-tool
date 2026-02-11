import { sql } from './db';
import { MONITORED_BRANDS } from '@/config/brands';
import type { ProbeResult } from './probe-logic';
import { randomUUID } from 'crypto';

const PROBE_REGIONS = ['iad1', 'lhr1', 'sfo1', 'fra1', 'syd1'] as const;
const BATCH_SIZE = 5;

export interface AuditRunResult {
  success: boolean;
  brands_audited: number;
  rows_inserted: number;
  errors?: string[];
}

/**
 * Run a full audit cycle for all monitored brands
 * Processes brands in batches, probing from all 5 regions simultaneously
 */
export async function runFullAudit(baseUrl: string, cronSecret: string): Promise<AuditRunResult> {
  const brands = [...MONITORED_BRANDS];
  let totalRowsInserted = 0;
  const errors: string[] = [];

  // Process brands in batches
  for (let i = 0; i < brands.length; i += BATCH_SIZE) {
    const batch = brands.slice(i, i + BATCH_SIZE);
    
    try {
      const batchResults = await Promise.all(
        batch.map(brandUrl => auditBrand(brandUrl, baseUrl, cronSecret))
      );

      // Flatten all probe results from this batch
      const allProbeResults = batchResults.flat();

      // Batch insert into database
      if (allProbeResults.length > 0) {
        await insertAuditLogs(allProbeResults);
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
 * Audit a single brand by probing from all 5 regions
 */
async function auditBrand(
  brandUrl: string,
  baseUrl: string,
  cronSecret: string
): Promise<Array<ProbeResult & { brand_url: string; request_id: string }>> {
  const requestId = randomUUID();

  // Call all 5 probe endpoints in parallel
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
      // Return an error result for this probe
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
 * Batch insert audit log results into the database
 */
async function insertAuditLogs(
  results: Array<ProbeResult & { brand_url: string; request_id: string }>
): Promise<void> {
  // Build values for batch insert
  const values = results.map((result) => ({
    request_id: result.request_id,
    brand_url: result.brand_url,
    region: result.region,
    status: result.status,
    ttfb: result.ttfb,
    headers: JSON.stringify(result.headers),
    error_message: result.error || null,
  }));

  // Use a transaction to insert all rows
  for (const row of values) {
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
        ${row.headers},
        ${row.error_message}
      )
    `;
  }
}
