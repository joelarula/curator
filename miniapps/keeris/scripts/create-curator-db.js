import pg from 'pg';

async function createDatabase() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://curator:curator_secret@192.168.1.110:5432/keeris';
  const client = new pg.Client(connectionString);
  await client.connect();

  const check = await client.query("SELECT 1 FROM pg_database WHERE datname = 'curator'");
  if (check.rows.length === 0) {
    await client.query('CREATE DATABASE curator');
    console.log('✓ Successfully created database "curator" on PostgreSQL host (192.168.1.110:5432).');
  } else {
    console.log('✓ Database "curator" already exists on PostgreSQL host (192.168.1.110:5432).');
  }

  await client.end();
}

createDatabase().catch(console.error);
