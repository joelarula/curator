/**
 * Example: P2P Multi-Agent Ping-Pong Harness
 *
 * Demonstrates:
 * 1. Booting two independent Curator Host instances (Host Alpha & Host Beta) with distinct SQLite databases.
 * 2. Connecting them in a distributed P2P event mesh via `@curator/federation`.
 * 3. Initiating with a "BANG!" event trigger.
 * 4. Exchanging bidirectional "PING" and "PONG" mesh events turn-by-turn.
 * 5. Terminating cleanly after reaching target turns.
 */

import { createCuratorHost } from '../../../packages/host/dist/index.js';
import { withFederation } from '../../../packages/federation/dist/index.js';
import { curatorEngine } from '../../../curator/dist/src/index.js';

async function main() {
  console.log('====================================================');
  console.log('  🏓 P2P Curator Host Ping-Pong Harness');
  console.log('  Host Alpha (Port 4101) <---> Host Beta (Port 4102)');
  console.log('====================================================\n');

  const TARGET_TURNS = 5;

  // ----------------------------------------------------
  // 1. Boot Host Alpha
  // ----------------------------------------------------
  console.log('[1/4] Booting Host Alpha (Port 4101)...');
  const hostAlpha = await createCuratorHost({
    name: 'host-alpha',
    dataDir: './data/peer_alpha',
    intervalMs: 1000,
    registerPlugins: async () => curatorEngine,
  });

  const meshAlpha = await withFederation(hostAlpha, {
    peerId: 'alpha',
    name: 'Peer Alpha',
    meshPort: 4101,
    peers: [
      {
        id: 'beta',
        name: 'Peer Beta',
        eventsUrl: 'ws://127.0.0.1:4102/api/mesh/events',
      },
    ],
  });

  await hostAlpha.start(1000);

  // ----------------------------------------------------
  // 2. Boot Host Beta
  // ----------------------------------------------------
  console.log('[2/4] Booting Host Beta (Port 4102)...');
  const hostBeta = await createCuratorHost({
    name: 'host-beta',
    dataDir: './data/peer_beta',
    intervalMs: 1000,
    registerPlugins: async () => curatorEngine,
  });

  const meshBeta = await withFederation(hostBeta, {
    peerId: 'beta',
    name: 'Peer Beta',
    meshPort: 4102,
    peers: [
      {
        id: 'alpha',
        name: 'Peer Alpha',
        eventsUrl: 'ws://127.0.0.1:4101/api/mesh/events',
      },
    ],
  });

  await hostBeta.start(1000);

  // Allow WebSocket handshakes to stabilize
  await new Promise((r) => setTimeout(r, 800));

  // ----------------------------------------------------
  // 3. Setup Symmetric Peer Agent Logic with Stateful Session & Context Tracking
  // ----------------------------------------------------
  console.log('\n[3/4] Registering Stateful P2P Agents on Alpha & Beta...');

  let gameCompletedResolve: () => void;
  const gameCompletedPromise = new Promise<void>((resolve) => {
    gameCompletedResolve = resolve;
  });

  /**
   * Stateful Symmetric Ping-Pong Agent:
   * - Tracks persistent turn count and rally history in SQLite `Conversation.metadata`.
   * - Logs turn execution records into SQLite `Response`.
   * - Enriches outgoing mesh event payloads with active session ID and context state.
   */
  function attachSymmetricAgent(host: any, mesh: any, peerName: string) {
    const convExternalId = `conv_game_${peerName}`;

    // Helper to persist turn context into database
    const updateSessionState = async (action: string, turn: number, fromPeer: string) => {
      try {
        const user = await host.prisma.user.findFirst({ where: { email: `${peerName}@federation.local` } });
        const conv = await host.prisma.conversation.upsert({
          where: { externalId: convExternalId },
          update: {
            metadata: {
              peerName,
              currentTurn: turn,
              lastAction: action,
              lastSender: fromPeer,
              ralliesCount: turn,
              updatedAt: new Date().toISOString(),
            },
          },
          create: {
            externalId: convExternalId,
            userId: user?.id || '1',
            projectId: '1',
            metadata: {
              peerName,
              currentTurn: turn,
              lastAction: action,
              lastSender: fromPeer,
              ralliesCount: turn,
              startedAt: new Date().toISOString(),
            },
          },
        });

        // Record response log in database
        await host.prisma.response.create({
          data: {
            conversationId: conv.id,
            projectId: '1',
            content: JSON.stringify({
              action,
              turn,
              sender: fromPeer,
              timestamp: new Date().toISOString(),
            }),
          },
        });
      } catch (err: any) {
        console.warn(`[${peerName}] Could not update DB session state:`, err?.message || err);
      }
    };

    host.events.onEvent(async (event: any) => {
      const type = event.type;
      const payload = event.payload || {};
      const sender = payload.sender;

      // Ignore echoes of our own sent events
      if (sender === peerName) return;

      // 1. BANG trigger -> Serve first PING
      if (type === 'game:bang' || type === 'mesh:game:bang') {
        console.log(`💥 [${peerName.toUpperCase()}] Received BANG! Starting Session (Turn 1)...`);
        await updateSessionState('SERVE_PING', 1, peerName);

        mesh.broadcastEvent('game:ping', {
          turn: 1,
          message: `PING #1 from ${peerName}`,
          sender: peerName,
          sessionId: `session_peer_${peerName}`,
          contextState: { rally: 1, score: 10 },
        });
        return;
      }

      // 2. PING received -> Persist turn in session & Reply with PONG
      if (type === 'game:ping' || type === 'mesh:game:ping') {
        const turn = Number(payload.turn || 1);
        console.log(`  🎾 [${peerName.toUpperCase()}] Received PING #${turn} from ${sender} (Session: ${payload.sessionId || 'N/A'}) -> Replying PONG #${turn}`);
        await updateSessionState('RECEIVE_PING_SEND_PONG', turn, sender);

        await new Promise((r) => setTimeout(r, 250));
        mesh.broadcastEvent('game:pong', {
          turn,
          message: `PONG #${turn} from ${peerName}`,
          sender: peerName,
          sessionId: `session_peer_${peerName}`,
          contextState: { rally: turn, score: turn * 10 },
        });
        return;
      }

      // 3. PONG received -> Persist turn in session & Advance to next PING
      if (type === 'game:pong' || type === 'mesh:game:pong') {
        const turn = Number(payload.turn || 1);
        console.log(`🏓 [${peerName.toUpperCase()}] Received PONG #${turn} from ${sender}!`);
        await updateSessionState('RECEIVE_PONG', turn, sender);

        if (turn >= TARGET_TURNS) {
          console.log(`\n🏆 [${peerName.toUpperCase()}] Target ${TARGET_TURNS} turns reached. Match finished!`);
          gameCompletedResolve();
          return;
        }

        const nextTurn = turn + 1;
        await new Promise((r) => setTimeout(r, 250));
        console.log(`\n🏓 [${peerName.toUpperCase()}] Serving PING #${nextTurn} -> ${sender}`);
        await updateSessionState('SERVE_PING', nextTurn, peerName);

        mesh.broadcastEvent('game:ping', {
          turn: nextTurn,
          message: `PING #${nextTurn} from ${peerName}`,
          sender: peerName,
          sessionId: `session_peer_${peerName}`,
          contextState: { rally: nextTurn, score: nextTurn * 10 },
        });
      }
    });
  }

  // Attach stateful symmetric agent rule to both Peer Alpha and Peer Beta
  attachSymmetricAgent(hostAlpha, meshAlpha, 'alpha');
  attachSymmetricAgent(hostBeta, meshBeta, 'beta');

  // ----------------------------------------------------
  // 4. Initiate the Game with BANG!
  // ----------------------------------------------------
  console.log('[4/4] Initiating match with BANG! trigger...\n');
  meshAlpha.broadcastEvent('game:bang', {
    startedAt: new Date().toISOString(),
    match: 'Stateful Peer Alpha <---> Peer Beta',
    sender: 'initiator',
  });

  // Wait for game loop to complete
  await gameCompletedPromise;

  // ----------------------------------------------------
  // 5. Inspect Provisioned Peer Identity & Session Records
  // ----------------------------------------------------
  console.log('\n--- [Peer Identity, Session & Conversation Audit] ---');
  const alphaUsers = await hostAlpha.prisma.user.findMany({ select: { id: true, email: true, name: true } });
  const alphaConvs = await hostAlpha.prisma.conversation.findMany({ select: { externalId: true, metadata: true } });
  const alphaResponses = await hostAlpha.prisma.response.findMany({
    select: { id: true, content: true },
    orderBy: { id: 'asc' },
  });

  console.log('Host Alpha Database Users:');
  console.log(JSON.stringify(alphaUsers, null, 2));
  console.log('\nHost Alpha Conversations & State Metadata:');
  console.log(JSON.stringify(alphaConvs, null, 2));
  console.log(`\nHost Alpha Turn Execution Logs in SQLite (${alphaResponses.length} total):`);
  for (const resp of alphaResponses) {
    console.log(`  [Response #${resp.id}]: ${resp.content}`);
  }

  // ----------------------------------------------------
  // 6. Clean Shutdown
  // ----------------------------------------------------
  console.log('\n--- Shutting down Peer Hosts cleanly ---');
  await meshAlpha.close();
  await meshBeta.close();
  await hostAlpha.stop();
  await hostBeta.stop();
  console.log('✅ P2P Ping-Pong Harness completed successfully.\n');
}

main().catch((err) => {
  console.error('Ping-Pong harness failed:', err);
  process.exit(1);
});
