import { neon } from '@neondatabase/serverless';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

export const sql = neon(process.env.POSTGRES_URL);

export interface AuditLog {
  id: number;
  request_id: string;
  brand_url: string;
  region: string;
  timestamp: Date;
  status: number;
  ttfb: number;
  headers: Record<string, string>;
  error_message: string | null;
}

export interface AuditLogInsert {
  request_id: string;
  brand_url: string;
  region: string;
  status: number;
  ttfb: number;
  headers: Record<string, string>;
  error_message?: string | null;
}
