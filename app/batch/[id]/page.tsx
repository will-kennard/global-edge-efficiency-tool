import { getLogsByBatchId, type AuditLogRow } from '@/lib/data/audit-logs';
import { getTechStack } from '@/config/brand-lists';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const REGION_LABELS: Record<string, string> = {
  iad1: 'US East',
  lhr1: 'London',
  sfo1: 'San Francisco',
  fra1: 'Frankfurt',
  syd1: 'Sydney',
};

interface RegionStat {
  region: string;
  avgTtfb: number;
  minTtfb: number;
  maxTtfb: number;
  probeCount: number;
  errorCount: number;
  successCount: number;
}

function computeRegionStats(logs: AuditLogRow[]): RegionStat[] {
  const byRegion = new Map<string, AuditLogRow[]>();
  for (const log of logs) {
    const group = byRegion.get(log.region) ?? [];
    group.push(log);
    byRegion.set(log.region, group);
  }

  return Array.from(byRegion.entries())
    .map(([region, regionLogs]) => {
      const successful = regionLogs.filter((l) => !l.error_message);
      const ttfbs = successful.map((l) => l.ttfb);
      return {
        region,
        avgTtfb: ttfbs.length > 0 ? Math.round(ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length) : 0,
        minTtfb: ttfbs.length > 0 ? Math.min(...ttfbs) : 0,
        maxTtfb: ttfbs.length > 0 ? Math.max(...ttfbs) : 0,
        probeCount: regionLogs.length,
        errorCount: regionLogs.filter((l) => l.error_message).length,
        successCount: successful.length,
      };
    })
    .sort((a, b) => a.avgTtfb - b.avgTtfb);
}

function groupByBrand(logs: AuditLogRow[]): Map<string, AuditLogRow[]> {
  const grouped = new Map<string, AuditLogRow[]>();
  for (const log of logs) {
    const group = grouped.get(log.brand_url) ?? [];
    group.push(log);
    grouped.set(log.brand_url, group);
  }
  return grouped;
}

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const logs = await getLogsByBatchId(id);

  if (logs.length === 0) {
    notFound();
  }

  const uniqueBrands = new Set(logs.map((l) => l.brand_url));
  const errorCount = logs.filter((l) => l.error_message).length;
  const batchTimestamp = logs.reduce(
    (earliest, l) => (l.timestamp < earliest ? l.timestamp : earliest),
    logs[0].timestamp,
  );

  const regionStats = computeRegionStats(logs);
  const brandGroups = groupByBrand(logs);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          &larr; Back to Dashboard
        </Link>

        {/* Batch header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Batch Detail</h1>
          <p className="mt-1 font-mono text-sm text-foreground/40">{id}</p>
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-black/[.08] bg-background p-4 dark:border-white/[.145]">
            <div className="text-sm text-foreground/60">Run Time</div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {new Date(batchTimestamp).toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-black/[.08] bg-background p-4 dark:border-white/[.145]">
            <div className="text-sm text-foreground/60">Brands</div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {uniqueBrands.size}
            </div>
          </div>
          <div className="rounded-lg border border-black/[.08] bg-background p-4 dark:border-white/[.145]">
            <div className="text-sm text-foreground/60">Total Probes</div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {logs.length}
            </div>
          </div>
          <div className="rounded-lg border border-black/[.08] bg-background p-4 dark:border-white/[.145]">
            <div className="text-sm text-foreground/60">Errors</div>
            <div className={`mt-1 text-lg font-semibold ${errorCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
              {errorCount}
            </div>
          </div>
        </div>

        {/* Regional comparison */}
        <div className="mb-8 rounded-lg border border-black/[.08] bg-background p-6 dark:border-white/[.145]">
          <h2 className="mb-4 text-xl font-semibold text-foreground">
            Regional Comparison
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-black/[.08] dark:divide-white/[.145]">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                    Region
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                    Avg TTFB (ms)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                    Min / Max
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                    Probes
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                    Success
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                    Errors
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.08] dark:divide-white/[.145]">
                {regionStats.map((stat) => (
                  <tr key={stat.region} className="hover:bg-black/[.04] dark:hover:bg-white/[.06]">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                      <span className="font-mono">{stat.region}</span>
                      <span className="ml-2 text-foreground/40">
                        {REGION_LABELS[stat.region] ?? ''}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-foreground">
                      {stat.avgTtfb}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-foreground/60">
                      {stat.minTtfb} / {stat.maxTtfb}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                      {stat.probeCount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-green-600 dark:text-green-400">
                      {stat.successCount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {stat.errorCount > 0 ? (
                        <span className="text-red-600 dark:text-red-400">{stat.errorCount}</span>
                      ) : (
                        <span className="text-foreground/40">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-brand breakdown */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-foreground">
            Per-Brand Breakdown
          </h2>

          {Array.from(brandGroups.entries()).map(([brandUrl, brandLogs]) => {
            const brandAvgTtfb = (() => {
              const successful = brandLogs.filter((l) => !l.error_message);
              if (successful.length === 0) return 0;
              return Math.round(
                successful.reduce((sum, l) => sum + l.ttfb, 0) / successful.length,
              );
            })();
            const brandErrors = brandLogs.filter((l) => l.error_message).length;
            const techStack = getTechStack(brandUrl);

            return (
              <div
                key={brandUrl}
                className="rounded-lg border border-black/[.08] bg-background p-6 dark:border-white/[.145]"
              >
                {/* Brand header */}
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {brandUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </h3>
                    {techStack && (
                      <p className="mt-1 text-sm text-foreground/60">
                        Tech stack: {techStack}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-foreground/60">
                    <span>Avg TTFB: <span className="font-mono text-foreground">{brandAvgTtfb}ms</span></span>
                    <span>{brandLogs.length} probes</span>
                    {brandErrors > 0 && (
                      <span className="text-red-600 dark:text-red-400">{brandErrors} error{brandErrors !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>

                {/* Regional probes table */}
                <div className="mb-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-black/[.08] dark:divide-white/[.145]">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                          Region
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                          TTFB (ms)
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                          Cache
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                          Tech Stack
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-foreground/60">
                          Error
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[.08] dark:divide-white/[.145]">
                      {brandLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-black/[.04] dark:hover:bg-white/[.06]">
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-foreground">
                            <span className="font-mono">{log.region}</span>
                            <span className="ml-2 text-foreground/40 text-xs">
                              {REGION_LABELS[log.region] ?? ''}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm">
                            {log.error_message ? (
                              <span className="text-red-600 dark:text-red-400">Error</span>
                            ) : (
                              <span className={log.status >= 200 && log.status < 300 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                                {log.status}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm font-mono text-foreground">
                            {log.ttfb}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm font-mono text-foreground/60">
                            {log.headers['cf-cache-status'] ||
                              log.headers['x-vercel-cache'] ||
                              log.headers['x-cache'] ||
                              '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-foreground/60">
                            {techStack || '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-red-600 dark:text-red-400">
                            {log.error_message ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Full headers per probe */}
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-foreground/60 hover:text-foreground transition-colors">
                    View all response headers
                  </summary>
                  <div className="mt-3 space-y-3">
                    {brandLogs.map((log) => (
                      <div key={log.id} className="rounded-lg bg-black/[.03] p-4 dark:bg-white/[.04]">
                        <div className="mb-2 text-xs font-medium text-foreground/60">
                          <span className="font-mono">{log.region}</span>
                          {' '}&mdash;{' '}
                          {log.error_message ? (
                            <span className="text-red-600 dark:text-red-400">{log.error_message}</span>
                          ) : (
                            <span>Status {log.status}, TTFB {log.ttfb}ms</span>
                          )}
                        </div>
                        {Object.keys(log.headers).length > 0 ? (
                          <table className="w-full">
                            <tbody className="divide-y divide-black/[.06] dark:divide-white/[.08]">
                              {Object.entries(log.headers)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([key, value]) => (
                                  <tr key={key}>
                                    <td className="py-1 pr-4 align-top text-xs font-mono font-medium text-foreground/60 whitespace-nowrap">
                                      {key}
                                    </td>
                                    <td className="py-1 text-xs font-mono text-foreground break-all">
                                      {value}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-foreground/40 italic">No headers captured</p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
