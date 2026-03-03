'use server';

import { revalidatePath } from 'next/cache';
import { runFullAudit, runSingleBrandAudit } from '@/lib/services/audit-service';
import { SINGLE_BRAND_URL } from '@/config/single-brand';

function getBaseUrl(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `http://localhost:${process.env.PORT || 3000}`;
}

export async function triggerAudit(): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    throw new Error('CRON_SECRET not configured');
  }

  const result = await runFullAudit(getBaseUrl(), cronSecret);

  if (!result.success) {
    throw new Error(`Audit failed: ${result.errors?.join(', ')}`);
  }

  revalidatePath('/');
}

export async function triggerSingleBrandAudit(): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    throw new Error('CRON_SECRET not configured');
  }

  const result = await runSingleBrandAudit(SINGLE_BRAND_URL, getBaseUrl(), cronSecret);

  if (!result.success) {
    throw new Error(`Single brand audit failed: ${result.errors?.join(', ')}`);
  }

  revalidatePath('/');
}
