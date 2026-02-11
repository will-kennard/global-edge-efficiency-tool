export interface ProbeResult {
  region: string;
  ttfb: number;
  status: number;
  headers: Record<string, string>;
  error?: string;
}

const PROBE_TIMEOUT_MS = 6000;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// Headers to extract from the response
const STANDARD_HEADERS = [
  'cache-control',
  'age',
  'vary',
  'etag',
  'last-modified',
  'server',
  'date',
  'expires',
] as const;

const CDN_HEADERS = [
  'cf-cache-status',
  'cf-ray',
  'x-vercel-cache',
  'x-vercel-id',
  'x-cache',
  'x-cache-hits',
  'x-served-by',
  'x-amz-cf-pop',
  'x-azure-ref',
  'server-timing',
] as const;

const HEADERS_TO_EXTRACT = [...STANDARD_HEADERS, ...CDN_HEADERS];

/**
 * Execute a probe request to a URL from a specific region
 * @param url - The URL to probe
 * @param region - The region identifier (e.g., 'iad1', 'syd1')
 * @returns ProbeResult with timing, status, headers, or error
 */
export async function runProbe(url: string, region: string): Promise<ProbeResult> {
  const startTime = performance.now();

  try {
    // Create an AbortController for timeout enforcement
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
      // Disable redirect following to capture CDN behavior
      redirect: 'manual',
    });

    clearTimeout(timeoutId);

    const endTime = performance.now();
    const ttfb = Math.round(endTime - startTime);

    // Extract relevant headers (normalize to lowercase)
    const headers: Record<string, string> = {};
    HEADERS_TO_EXTRACT.forEach((headerName) => {
      const value = response.headers.get(headerName);
      if (value !== null) {
        headers[headerName] = value;
      }
    });

    return {
      region,
      ttfb,
      status: response.status,
      headers,
    };
  } catch (error) {
    const endTime = performance.now();
    const ttfb = Math.round(endTime - startTime);

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = `Timeout after ${PROBE_TIMEOUT_MS}ms`;
      } else {
        errorMessage = error.message;
      }
    }

    return {
      region,
      ttfb,
      status: 0,
      headers: {},
      error: errorMessage,
    };
  }
}
