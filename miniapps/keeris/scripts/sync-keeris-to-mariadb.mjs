import { openDatabase } from '../src/db.ts';
import { registerKeerisPlugins } from '../src/plugins/index.ts';
import { curatorEngine, CuratorRequestProcessor } from '@curator/agent-server';
import { provisionMariadbDb } from '../../../curator/src/db/mariadbProvisioner.ts';

async function main() {
  console.log('[Sync] Connecting to MariaDB keeris & curator...');
  const keerisDb = openDatabase('mysql://curator:curator_secret@192.168.1.110:3306/keeris');
  
  console.log('[Sync] Registering Keeris domain and ERR radio plugins...');
  await registerKeerisPlugins({ db: keerisDb });
  console.log(`[Sync] Registered ${curatorEngine.tools.size} tools in CuratorEngine:`, Array.from(curatorEngine.tools.keys()));
  console.log(`[Sync] Registered ${curatorEngine.agents.size} agents in CuratorEngine:`, Array.from(curatorEngine.agents.keys()));

  console.log('[Sync] Connecting Prisma to MariaDB curator database...');
  const prisma = await provisionMariadbDb('mysql://curator:curator_secret@192.168.1.110:3306/curator');

  console.log('[Sync] Creating CuratorRequestProcessor and syncing tools & agents...');
  const processor = new CuratorRequestProcessor(prisma);
  
  // Call sync methods
  await processor.syncToolsToDb();
  await processor.syncAgentsToDb();

  const toolCount = await prisma.tool.count();
  const agentCount = await prisma.agent.count();
  const agents = await prisma.agent.findMany({ select: { name: true, enabled: true } });
  
  console.log(`\n========================================`);
  console.log(`✓ SYNC SUCCESSFUL TO MARIADB CURATOR!`);
  console.log(`Tools in MariaDB curator: ${toolCount}`);
  console.log(`Agents in MariaDB curator: ${agentCount}`);
  console.log(`Agents:`, agents.map(a => a.name));
  console.log(`========================================\n`);

  await prisma.$disconnect();
  await keerisDb.close();
}

main().catch(console.error);
