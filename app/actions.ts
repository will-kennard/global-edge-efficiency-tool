'use server';

import { revalidatePath } from 'next/cache';

export async function triggerAudit(): Promise<void> {
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
}
