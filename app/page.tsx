import { BRAND_LISTS } from '@/config/brand-lists';
import { getDashboardData } from '@/lib/services/audit-service';
import { ControlPanel } from '@/app/components/control-panel';
import Link from 'next/link';

export default async function Home() {
  const { batches, latestRun } = await getDashboardData();
  const uniqueBrandCount = new Set(BRAND_LISTS.flatMap((l) => l.brands.map((b) => b.company_url))).size;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground">
            Global Edge Efficiency Analyzer
          </h1>
          <p className="mt-2 text-lg text-foreground/60">
            Distributed edge cache auditing across {uniqueBrandCount}+ brands and 5 global regions
          </p>
        </div>

        {/* Control Panel */}
        <ControlPanel />

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
                  {batches.map((batch) => (
                    <Link
                      key={batch.batch_id}
                      href={`/batch/${batch.batch_id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
                    >
                      <span>{new Date(batch.run_time).toLocaleString()}</span>
                      <span className="text-xs text-foreground/40">
                        {batch.brands_count} brand{batch.brands_count !== 1 ? 's' : ''} &middot; {batch.probe_count} probes
                        {batch.error_count > 0 && (
                          <span className="text-red-500"> &middot; {batch.error_count} err</span>
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
