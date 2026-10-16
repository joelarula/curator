import { CuratorBuilder as Curator, type CuratorSequentialNode } from '../curator.ts';
import {
  getHumanTurnAST,
  getAgentTurnAST,
  getPokerWorkflowAST,
} from './pokerHandScript.ts';

export async function run({ prisma, conversationId }: { prisma: any, conversationId: string }): Promise<CuratorSequentialNode> {
  console.log('Seeding Expressive Multiplayer Poker Game using Modular CoffeeScript ASTs...');

  // Use seeded Users & Projects
  const user = await prisma.user.findFirst({ where: { username: 'system' } }) || await prisma.user.findFirst();
  const project = await prisma.project.findFirst({ where: { name: 'System Project' } }) || await prisma.project.findFirst();
  
  if (!user || !project) {
    throw new Error("No user or project found in DB. Please run the database seed first.");
  }
  
  const userId = user.id;
  const projectId = project.id;

  // 1. Setup Human Player with AST compiled from human_turn.coffee
  const humanAgent = await prisma.agent.create({
    data: { name: 'Human_Player_' + Date.now(), userId, projectId }
  });
  
  const humanAST = await getHumanTurnAST();
  const humanWorkflow = await prisma.agentWorkflow.create({
    data: {
      name: 'Human_Player_Turn_Logic_' + Date.now(),
      agentId: humanAgent.id,
      ast: humanAST as any,
    }
  });
  await prisma.eventSubscription.create({
    data: { eventName: 'poker:awaiting_human_action', agentWorkflowId: humanWorkflow.id, userId, projectId, conversationId }
  });

  // 2. Setup AI Players sharing the universal agent_turn.coffee AST
  const aiPersonas = [
    { name: 'Viper_Shark', instruction: "You are Viper, a ruthless and calculating poker shark." },
    { name: 'MadDog_Maniac', instruction: "You are MadDog, a wild and loud poker maniac." },
    { name: 'Barnaby_Station', instruction: "You are Barnaby, an affable, folksy calling station." },
  ];

  const aiIds: number[] = [];
  const aiTurnAST = await getAgentTurnAST();

  for (const persona of aiPersonas) {
    const aiAgent = await prisma.agent.create({
      data: { name: persona.name + '_' + Date.now(), userId, projectId }
    });
    aiIds.push(aiAgent.id);

    const aiWorkflow = await prisma.agentWorkflow.create({
      data: {
        name: persona.name + '_Turn_Logic_' + Date.now(),
        agentId: aiAgent.id,
        ast: aiTurnAST as any,
      }
    });
    await prisma.eventSubscription.create({
      data: { eventName: 'poker:agent_turn_requested', agentWorkflowId: aiWorkflow.id, userId, projectId, conversationId }
    });
  }

  // 3. Setup Master Game Engine Workflow loaded from poker_workflow.coffee
  const engineWorkflowAST = (await getPokerWorkflowAST()) as CuratorSequentialNode;
  console.log('Expressive Poker Orchestrator Ready with shared CoffeeScript ASTs.');
  return engineWorkflowAST;
}
