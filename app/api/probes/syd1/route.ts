import { NextRequest, NextResponse } from 'next/server';
import { runProbe } from '@/lib/probe-logic';

const REGION = 'syd1';

export async function GET(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('Authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  
  if (!authHeader || authHeader !== expectedAuth) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Get URL from query parameters
  const url = request.nextUrl.searchParams.get('url');
  
  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  // Execute probe
  const result = await runProbe(url, REGION);

  return NextResponse.json(result);
}
