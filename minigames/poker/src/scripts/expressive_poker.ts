import { CuratorBuilder as Curator } from '@curator/agent-server';
import type { CuratorSequentialNode } from '@curator/agent-server';

export async function run({ prisma, conversationId }: { prisma: any, conversationId: string }): Promise<CuratorSequentialNode> {
  console.log('Seeding Expressive Multiplayer Poker Game...');

  // Use seeded Users & Projects
  const user = await prisma.user.findFirst({ where: { username: 'system' } }) || await prisma.user.findFirst();
  const project = await prisma.project.findFirst({ where: { name: 'System Project' } }) || await prisma.project.findFirst();
  
  if (!user || !project) {
    throw new Error("No user or project found in DB. Please run the database seed first.");
  }
  
  const userId = user.id;
  const projectId = project.id;



  // 1. Setup Human Player
  const humanAgent = await prisma.agent.create({
    data: { name: 'Human_Player_' + Date.now(), userId, projectId }
  });
  
  const humanWorkflow = await prisma.agentWorkflow.create({
    data: {
      name: 'Human_Player_Turn_Logic_' + Date.now(),
      agentId: humanAgent.id,
      ast: Curator.seq('Human_Turn',
        Curator.humanInput('Your turn! Current Pot: {state.pot}. Community: {state.community}. Hand: {state.activeHand}. Choose your action:', 'choices', ['fold', 'call', 'raise']),
        Curator.emitEvent('player_action_submitted')
      ) as any
    }
  });
  await prisma.eventSubscription.create({
    data: { eventName: 'player_turn_requested', agentWorkflowId: humanWorkflow.id, userId, projectId, conversationId }
  });

  // 2. Setup AI Players (Two different personas sharing the exact same state logic)
  const aiPersonas = [
    { name: 'Aggressive_AI', instruction: 'You are an aggressive poker player. You raise often.' },
    { name: 'Conservative_AI', instruction: 'You are a conservative poker player. You fold unless your hand is great.' }
  ];

  const aiIds: number[] = [];

  for (const persona of aiPersonas) {
    const aiAgent = await prisma.agent.create({
      data: { name: persona.name + '_' + Date.now(), userId, projectId }
    });
    aiIds.push(aiAgent.id);

    const aiWorkflow = await prisma.agentWorkflow.create({
      data: {
        name: persona.name + '_Turn_Logic_' + Date.now(),
        agentId: aiAgent.id,
        ast: Curator.seq('AI_Turn',
          Curator.agent({
            instruction: persona.instruction,
            prompt: 'Your turn! Pot: {state.pot}. Community: {state.community}. Hand: {state.activeHand}. Decide your action.',
            output_schema: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["fold", "call", "raise"] },
                amount: { type: "number" }
              },
              required: ["action"]
            }
          }),
          Curator.emitEvent('player_action_submitted')
        ) as any
      }
    });
    await prisma.eventSubscription.create({
      data: { eventName: 'player_turn_requested', agentWorkflowId: aiWorkflow.id, userId, projectId, conversationId }
    });
  }

  // 3. Setup the highly expressive Game Engine
  // The Game Engine manages the loop and synchronously waits for actions!
  const players = [humanAgent.id, ...aiIds];

  const engineWorkflowAST = Curator.seq('Poker_Game_Engine',
    // Initialize Game state wrapper variables
    Curator.setState({
      turn_index: 0,
      gameOver: false,
      player_mapping: { 1: humanAgent.id, 2: aiIds[0], 3: aiIds[1] }
    }),
    
    // Call poker_tools to shuffle and deal
    Curator.tool('deal_cards', { players: 3 }),
    
    // Game Loop
    Curator.whileLoop((ctx) => !ctx.state.gameOver, Curator.seq('Turn_Loop',
      // Figure out whose turn it is based on remaining active players
      Curator.assign('activePlayerNum', (ctx) => {
         const active = ctx.state.active_players || [1, 2, 3];
         if (active.length === 1) return active[0];
         return active[ctx.state.turn_index % active.length];
      }),
      Curator.assign('activePlayerId', (ctx) => ctx.state.player_mapping[ctx.state.activePlayerNum]),
      Curator.assign('activeHand', (ctx) => ctx.state['hand_' + ctx.state.activePlayerNum]),
      
      // Request action from that specific player dynamically
      Curator.emitEvent('player_turn_requested', { message: "It's your turn!" }, (ctx) => ctx.state.activePlayerId),
      
      // Synchronously wait for ANY player to submit an action
      Curator.waitEvent('player_action_submitted', 'lastAction'),
      
      // Use poker_tools to apply the bet
      Curator.tool('apply_bet', {
         player: "(ctx) => ctx.state.activePlayerNum",
         action: "(ctx) => typeof ctx.state.lastAction === 'string' ? ctx.state.lastAction : (ctx.state.lastAction.action + (ctx.state.lastAction.amount ? ' ' + ctx.state.lastAction.amount : ''))"
      }),
      
      // Advance turn and compute phase changes
      Curator.script((context) => {
         const active = context.state.active_players;
         if (active && active.length <= 1) {
             context.state.gameOver = true;
             context.state.needs_reveal = 0;
             const winner = active[0] || 1;
             context.state.balances[winner] += context.state.pot;
             context.state.winner = winner;
             context.state.pot = 0;
         } else {
             context.state.turn_index++;
             // Simplistic betting round check (1 turn per active player)
             if (context.state.turn_index >= active.length) {
                 context.state.turn_index = 0;
                 if (context.state.phase === 'preflop') {
                     context.state.phase = 'flop';
                     context.state.needs_reveal = 3;
                 } else if (context.state.phase === 'flop') {
                     context.state.phase = 'turn';
                     context.state.needs_reveal = 1;
                 } else if (context.state.phase === 'turn') {
                     context.state.phase = 'river';
                     context.state.needs_reveal = 1;
                 } else {
                     context.state.gameOver = true;
                     context.state.needs_reveal = 0;
                     const winner = active[0] || 1;
                     context.state.balances[winner] += context.state.pot;
                     context.state.winner = winner;
                     context.state.pot = 0;
                 }
             } else {
                 context.state.needs_reveal = 0;
             }
         }
      }),
      
      // Dynamically call reveal_community if phase changed!
      Curator.ifElse(
         "(ctx) => ctx.state.needs_reveal > 0",
         Curator.tool('reveal_community', { count: "(ctx) => ctx.state.needs_reveal" })
      )
    )),

    Curator.humanInput('Game Over! Player {state.winner} won the pot. Final Balances: Player 1: {state.balances[1]}, Player 2: {state.balances[2]}, Player 3: {state.balances[3]}. Press Enter to finish.')
  );

  console.log('Expressive Poker Orchestrator Ready. Returning the Game Engine Workflow!');
  return engineWorkflowAST;
}
