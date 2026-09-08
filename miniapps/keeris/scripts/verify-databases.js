import pg from 'pg';

async function verify() {
  console.log('Connecting to PostgreSQL Host (192.168.1.110:5432)...');

  // Check keeris database
  const keerisClient = new pg.Client('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  await keerisClient.connect();
  const keerisTables = await keerisClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('\n📁 Database: keeris (Music & Radio domain)');
  console.log(keerisTables.rows.map(r => `  - ${r.table_name}`).join('\n'));
  await keerisClient.end();

  // Check curator database
  const curatorClient = new pg.Client('postgresql://curator:curator_secret@192.168.1.110:5432/curator');
  await curatorClient.connect();
  const curatorTables = await curatorClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('\n📁 Database: curator (Agent & Workflow orchestration)');
  console.log(curatorTables.rows.map(r => `  - ${r.table_name}`).join('\n'));
  await curatorClient.end();
}

verify().catch(console.error);
