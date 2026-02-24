import { MONITORED_BRANDS } from '@/config/brands';
import { SINGLE_BRAND_URL } from '@/config/single-brand';
import { getDashboardData } from '@/lib/services/audit-service';
import { triggerAudit, triggerSingleBrandAudit } from '@/app/actions';
import Link from 'next/link';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const params = await searchParams;
  const selectedBatchId = params.batch;

  const { batches, logs, latestRun } = await getDashboardData({
    batchId: selectedBatchId,
  });

  const activeBatchId = selectedBatchId ?? batches[0]?.batch_id;
  const activeBatch = batches.find((b) => b.batch_id === activeBatchId);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground">
            Global Edge Efficiency Analyzer
          </h1>
          <p className="mt-2 text-lg text-foreground/60">
            Distributed edge cache auditing from {MONITORED_BRANDS.length} brands across 5 global regions
          </p>
        </div>

        {/* Control Panel */}
        <div className="mb-8 rounded-lg border border-black/[.08] bg-background p-6 dark:border-white/[.145]">
          <h2 className="mb-4 text-xl font-semibold text-foreground">
            Control Panel
          </h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <form action={triggerAudit}>
                <button
                  type="submit"
                  className="rounded-lg bg-foreground px-6 py-3 font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:ring-offset-2 focus:ring-offset-background"
                >
                  Run Full Audit
                </button>
              </form>
              <p className="mt-2 text-sm text-foreground/60">
                Audit all {MONITORED_BRANDS.length} monitored brands
              </p>
            </div>
            <div>
              <form action={triggerSingleBrandAudit}>
                <button
                  type="submit"
                  className="rounded-lg border border-foreground/20 bg-background px-6 py-3 font-medium text-foreground transition-colors hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:ring-offset-2 focus:ring-offset-background"
                >
                  Test Single Brand
                </button>
              </form>
              <p className="mt-2 text-sm text-foreground/60">
                Test with {SINGLE_BRAND_URL.replace('https://', '')}
              </p>
            </div>
          </div>
        </div>

        {/* Latest Run Summary */}
        {latestRun && (
          <div className="mb-8 rounded-lg border border-black/[.08] bg-background p-6 dark:border-white/[.145]">
            <h2 className="mb-4 text-xl font-semibold text-foreground">
              Latest Run Summary
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="rounded-lg bg-black/[.05] p-4 dark:bg-white/[.06]">
                <div className="text-sm text-foreground/60">Run Time</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {new Date(latestRun.run_time).toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg bg-black/[.05] p-4 dark:bg-white/[.06]">
                <div className="text-sm text-foreground/60">Brands Audited</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {latestRun.brands_count}
                </div>
              </div>
              <div className="rounded-lg bg-black/[.05] p-4 dark:bg-white/[.06]">
                <div className="text-sm text-foreground/60">Total Probes</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {latestRun.probe_count}
                </div>
              </div>
              <div className="rounded-lg bg-black/[.05] p-4 dark:bg-white/[.06]">
                <div className="text-sm text-foreground/60">Errors</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {latestRun.error_count}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Batch Selector + Audit Logs */}
        <div className="rounded-lg border border-black/[.08] bg-background p-6 dark:border-white/[.145]">
          <h2 className="mb-4 text-xl font-semibold text-foreground">
            Audit Logs
          </h2>

          {batches.length === 0 ? (
            <p className="text-foreground/60">
              No audit logs yet. Run your first audit to see results here.
            </p>
          ) : (
            <>
              {/* Batch pills */}
              <div className="mb-6">
                <div className="mb-2 text-sm font-medium text-foreground/60">
                  Select Batch
                </div>
                <div className="flex flex-wrap gap-2">
                  {batches.map((batch) => {
                    const isActive = batch.batch_id === activeBatchId;
                    return (
                      <Link
                        key={batch.batch_id}
                        href={`/?batch=${batch.batch_id}`}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-foreground text-background'
                            : 'border border-foreground/20 text-foreground hover:bg-foreground/5'
                        }`}
                      >
                        <span>{new Date(batch.run_time).toLocaleString()}</span>
                        <span className={`text-xs ${isActive ? 'text-background/60' : 'text-foreground/40'}`}>
                          {batch.brands_count} brand{batch.brands_count !== 1 ? 's' : ''} &middot; {batch.probe_count} probes
                          {batch.error_count > 0 && (
                            <span className={isActive ? 'text-red-300' : 'text-red-500'}> &middot; {batch.error_count} err</span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Active batch summary */}
              {activeBatch && (
                <div className="mb-4 text-sm text-foreground/60">
                  Showing {logs.length} probe{logs.length !== 1 ? 's' : ''} from {activeBatch.brands_count} brand{activeBatch.brands_count !== 1 ? 's' : ''}
                  {' '}&mdash; {new Date(activeBatch.run_time).toLocaleString()}
                </div>
              )}

              {/* Logs table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-black/[.08] dark:divide-white/[.145]">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                        Brand
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                        Region
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                        TTFB (ms)
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                        Cache Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[.08] dark:divide-white/[.145]">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-black/[.04] dark:hover:bg-white/[.06]">
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {log.brand_url.replace('https://', '')}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-foreground">
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
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                          {log.ttfb}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-foreground/60">
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
