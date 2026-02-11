import { sql } from '@/lib/db';
import { MONITORED_BRANDS } from '@/config/brands';
import { revalidatePath } from 'next/cache';

interface AuditLog {
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

async function getRecentAuditLogs(): Promise<AuditLog[]> {
  try {
    const result = await sql<AuditLog[]>`
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
      LIMIT 50
    `;
    return result;
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return [];
  }
}

async function getLatestRunSummary() {
  try {
    const result = await sql`
      SELECT 
        request_id::text,
        COUNT(*) as probe_count,
        MIN(timestamp) as run_time,
        COUNT(DISTINCT brand_url) as brands_count,
        SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END) as error_count
      FROM audit_logs
      WHERE timestamp > NOW() - INTERVAL '2 hours'
      GROUP BY request_id
      ORDER BY MIN(timestamp) DESC
      LIMIT 1
    `;
    
    if (result.length > 0) {
      return result[0];
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch latest run summary:', error);
    return null;
  }
}

async function triggerAudit() {
  'use server';
  
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/cron/run-audit`, {
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Audit failed with status ${response.status}`);
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Failed to trigger audit:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export default async function Home() {
  const recentLogs = await getRecentAuditLogs();
  const latestRun = await getLatestRunSummary();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
            Global Edge Efficiency Analyzer
          </h1>
          <p className="mt-2 text-lg text-slate-600 dark:text-slate-300">
            Distributed edge cache auditing from {MONITORED_BRANDS.length} brands across 5 global regions
          </p>
        </div>

        {/* Control Panel */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-md dark:bg-slate-800">
          <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
            Control Panel
          </h2>
          <form action={triggerAudit}>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Run Audit Now
            </button>
          </form>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Manually trigger an audit cycle for all monitored brands
          </p>
        </div>

        {/* Latest Run Summary */}
        {latestRun && (
          <div className="mb-8 rounded-lg bg-white p-6 shadow-md dark:bg-slate-800">
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Latest Run Summary
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700">
                <div className="text-sm text-slate-600 dark:text-slate-400">Run Time</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {new Date(latestRun.run_time).toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700">
                <div className="text-sm text-slate-600 dark:text-slate-400">Brands Audited</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {latestRun.brands_count}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700">
                <div className="text-sm text-slate-600 dark:text-slate-400">Total Probes</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {latestRun.probe_count}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700">
                <div className="text-sm text-slate-600 dark:text-slate-400">Errors</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {latestRun.error_count}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Audit Logs */}
        <div className="rounded-lg bg-white p-6 shadow-md dark:bg-slate-800">
          <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
            Recent Audit Logs (Last 50)
          </h2>
          {recentLogs.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">
              No audit logs yet. Run your first audit to see results here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Brand
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Region
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      TTFB (ms)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Cache Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {recentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-900 dark:text-slate-300">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-300">
                        {log.brand_url.replace('https://', '')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-slate-900 dark:text-slate-300">
                        {log.region}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {log.error_message ? (
                          <span className="text-red-600 dark:text-red-400">Error</span>
                        ) : (
                          <span className={log.status >= 200 && log.status < 300 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                            {log.status}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-900 dark:text-slate-300">
                        {log.ttfb}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">
                        {log.headers['cf-cache-status'] || 
                         log.headers['x-vercel-cache'] || 
                         log.headers['x-cache'] || 
                         '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
