import { NextRequest, NextResponse } from 'next/server';
import { runFullAudit } from '@/lib/services/audit-service';

export async function GET(request: NextRequest) {
  try {
    // Verify authorization - accept either Vercel Cron header or CRON_SECRET
    const authHeader = request.headers.get('Authorization');
    const cronHeader = request.headers.get('x-vercel-cron');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    // Allow either Vercel's cron system or bearer token auth
    if (!cronHeader && (!authHeader || authHeader !== expectedAuth)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get base URL for self-referencing probe calls
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

    // Run the audit
    const result = await runFullAudit(baseUrl, cronSecret);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Audit run failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
