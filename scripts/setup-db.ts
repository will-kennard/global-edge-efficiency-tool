import { sql } from '../lib/db';

async function setupDatabase() {
  try {
    console.log('Creating audit_logs table if it does not exist...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        request_id UUID NOT NULL,
        brand_url TEXT NOT NULL,
        region TEXT NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        status INT NOT NULL,
        ttfb INT NOT NULL,
        headers JSONB NOT NULL,
        error_message TEXT
      )
    `;

    console.log('✓ audit_logs table created successfully');

    // Create indexes for common queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp 
      ON audit_logs(timestamp DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id 
      ON audit_logs(request_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_region 
      ON audit_logs(region)
    `;

    console.log('✓ Indexes created successfully');
    console.log('Database setup complete!');
    
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();
