import { CuratorBuilder as Curator } from '../src/engine/CuratorBuilder.js';
import type { CuratorSequentialNode } from '../src/engine/CuratorAst.js';

export async function run({ prisma }: { prisma: any }): Promise<CuratorSequentialNode> {
  console.log('Seeding Event-Driven Poker Game...');

  const user = await prisma.user.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, username: 'cli', email: 'cli@local', name: 'CLI User' }
  });
  const project = await prisma.project.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'System Project', userId: user.id }
  });
  const userId = user.id;
  const projectId = project.id;

  // Cleanup
  await prisma.eventSubscription.deleteMany({
    where: { eventName: { in: ['player_turn_requested', 'player_action_submitted'] } }
  });

  // 1. Setup Human Player
  const humanAgent = await prisma.agent.create({
    data: { name: 'Human_Player_' + Date.now(), userId, projectId }
  });
  
  const humanWorkflowAST = Curator.seq('Human_Player_Turn_Logic',
    Curator.humanInput('Your turn! Current Pot: {state.pot}. Hand: {state.hand_1}. Enter your action (e.g. {"action":"call","amount":0}):'),
    Curator.emitEvent('player_action_submitted')
  );

  const humanWorkflow = await prisma.agentWorkflow.create({
    data: {
      name: 'Human_Player_Turn_Logic_' + Date.now(),
      agentId: humanAgent.id,
      ast: humanWorkflowAST as any
    }
  });
  await prisma.eventSubscription.create({
    data: { eventName: 'player_turn_requested', agentWorkflowId: humanWorkflow.id, userId, projectId }
  });

  // 2. Setup AI Player
  const aiAgent = await prisma.agent.create({
    data: { name: 'AI_Player_' + Date.now(), userId, projectId }
  });
  
  const aiWorkflowAST = Curator.seq('AI_Player_Turn_Logic',
    Curator.agent({
      prompt: 'Your turn! You are Player 2. Pot: {state.pot}. Hand: {state.hand_2}. Decide your action and return JSON: {"action":"call","amount":0}'
    }),
    Curator.emitEvent('player_action_submitted')
  );

  const aiWorkflow = await prisma.agentWorkflow.create({
    data: {
      name: 'AI_Player_Turn_Logic_' + Date.now(),
      agentId: aiAgent.id,
      ast: aiWorkflowAST as any
    }
  });
  await prisma.eventSubscription.create({
    data: { eventName: 'player_turn_requested', agentWorkflowId: aiWorkflow.id, userId, projectId }
  });

  // 3. Setup Game Engine
  const engineAgent = await prisma.agent.create({
    data: { name: 'Game_Engine_' + Date.now(), userId, projectId }
  });
  
  // Game engine uses formal AST nodes and closures via CuratorBuilder
  const engineWorkflowAST = Curator.seq('Game_Engine_Logic',
    Curator.assign('turn_index', (ctx: any) => (ctx.state.turn_index || 0) + 1),
    Curator.ifElse((ctx: any) => ctx.state.turn_index % 2 === 0,
      Curator.emitEvent('player_turn_requested', { action_processed: true }, humanAgent.id),
      Curator.emitEvent('player_turn_requested', { action_processed: true }, aiAgent.id)
    )
  );

  const engineWorkflow = await prisma.agentWorkflow.create({
    data: {
      name: 'Game_Engine_Logic_' + Date.now(),
      agentId: engineAgent.id,
      ast: engineWorkflowAST as any
    }
  });
  await prisma.eventSubscription.create({
    data: { eventName: 'player_action_submitted', agentWorkflowId: engineWorkflow.id, userId, projectId }
  });

  console.log('Seeded 3 Agents (Human, AI, Engine). Emitting start event!');

  return Curator.seq('Event-Driven Poker Game setup',
    Curator.emitEvent('player_action_submitted', { message: "game_started" })
  );
}
