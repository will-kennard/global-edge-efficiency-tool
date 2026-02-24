import { sql } from '../lib/db';

async function setupDatabase() {
  try {
    console.log('Creating audit_logs table if it does not exist...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        batch_id UUID NOT NULL,
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

    // Migration for existing databases: add batch_id if missing
    await sql`
      ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS batch_id UUID
    `;

    // Backfill: set batch_id = request_id for any rows that predate the migration
    await sql`
      UPDATE audit_logs SET batch_id = request_id WHERE batch_id IS NULL
    `;

    // Now enforce NOT NULL (safe after backfill)
    await sql`
      ALTER TABLE audit_logs ALTER COLUMN batch_id SET NOT NULL
    `;

    console.log('✓ batch_id column ensured');

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

    await sql`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_batch_id 
      ON audit_logs(batch_id)
    `;

    console.log('✓ Indexes created successfully');
    console.log('Database setup complete!');
    
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();
