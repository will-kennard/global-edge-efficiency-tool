import { NextRequest, NextResponse } from 'next/server';
import { runSingleBrandAudit } from '@/lib/services/audit-service';
import { SINGLE_BRAND_URL } from '@/config/single-brand';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    if (!authHeader || authHeader !== expectedAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const brandUrl = request.nextUrl.searchParams.get('url') || SINGLE_BRAND_URL;

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`;

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    const result = await runSingleBrandAudit(brandUrl, baseUrl, cronSecret);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Single brand audit failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
