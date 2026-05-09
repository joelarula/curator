import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const sqlPath = path.join(__dirname, 'migrations', 'add_user_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running migration...');
    await client.query(sql);
    console.log('✅ User table created successfully');
  } catch (error) {
    console.error('Error running migration:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
