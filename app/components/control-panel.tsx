'use client';

import { useState } from 'react';
import { BRAND_LISTS, DEFAULT_BRAND_LIST_KEY } from '@/config/brand-lists';
import { SINGLE_BRAND_URL } from '@/config/single-brand';
import { triggerAudit, triggerSingleBrandAudit } from '@/app/actions';
import { SubmitButton } from '@/app/components/submit-button';

export function ControlPanel() {
  const [selectedListKey, setSelectedListKey] = useState(DEFAULT_BRAND_LIST_KEY);
  const selectedList = BRAND_LISTS.find((l) => l.key === selectedListKey) ?? BRAND_LISTS[0];
  const brandCount = selectedList.brands.length;

  return (
    <div className="mb-8 rounded-lg border border-black/[.08] bg-background p-6 dark:border-white/[.145]">
      <h2 className="mb-4 text-xl font-semibold text-foreground">
        Control Panel
      </h2>

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-foreground/60">
          Brand list
        </label>
        <select
          value={selectedListKey}
          onChange={(e) => setSelectedListKey(e.target.value)}
          className="rounded-lg border border-foreground/20 bg-background px-4 py-2 text-foreground focus:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
        >
          {BRAND_LISTS.map((list) => (
            <option key={list.key} value={list.key}>
              {list.label} ({list.brands.length} brands)
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <form action={triggerAudit.bind(null, selectedListKey)}>
            <SubmitButton
              className="rounded-lg bg-foreground px-6 py-3 font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-70 disabled:cursor-not-allowed"
              loadingLabel="Running..."
            >
              Run All Brands (Once)
            </SubmitButton>
          </form>
          <p className="mt-2 text-sm text-foreground/60">
            One-off audit of all {brandCount} brands from 5 regions
          </p>
        </div>
        <div>
          <form action={triggerSingleBrandAudit}>
            <SubmitButton
              className="rounded-lg border border-foreground/20 bg-background px-6 py-3 font-medium text-foreground transition-colors hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-70 disabled:cursor-not-allowed"
              loadingLabel="Running..."
            >
              Test Single Brand
            </SubmitButton>
          </form>
          <p className="mt-2 text-sm text-foreground/60">
            One-off probe of {SINGLE_BRAND_URL.replace('https://', '').replace(/\/$/, '')} from all 5 regions
          </p>
        </div>
      </div>
      <p className="mt-4 text-xs text-foreground/40">
        Run audits manually. Results appear in batch history below.
      </p>
    </div>
  );
}
