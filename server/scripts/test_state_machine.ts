import { Pipeline } from '../src/services/ast/builder.js';
import { TOOLS } from '../src/services/tools/manifest.js';

const pipeline = new Pipeline({
    meta: {
        agent: "StateMachine-Demo",
        purpose: "Demonstrate first-class state machine transitions in Curator pipelines"
    }
});

// 1. Declare first-class State Machine
pipeline.stateMachine('state_init', (sm) => {
    
    // State A: Initialize and query search
    sm.state('state_init', (flow) => {
        flow.tool(TOOLS.DEBUG, { message: "Entering state_init: fetching rust info..." });
        
        // Transition to checks state
        flow.transitionTo('state_checks');
    });

    // State B: Perform condition checks and branch
    sm.state('state_checks', (flow) => {
        flow.tool(TOOLS.DEBUG, { message: "Entering state_checks: checking condition..." });
        
        flow.if('true', (t) => {
            t.transitionTo('state_finish');
        }).else((f) => {
            f.transitionTo('state_failure');
        });
    });

    // State C: Successful termination
    sm.state('state_finish', (flow) => {
        flow.tool(TOOLS.DEBUG, { message: "Entering state_finish: Workflow successfully completed." });
        flow.transitionTo('END');
    });

    // State D: Failure state
    sm.state('state_failure', (flow) => {
        flow.tool(TOOLS.DEBUG, { message: "Entering state_failure: An issue occurred." });
        flow.transitionTo('END');
    });
});

console.log('--- COMPILED STATE MACHINE AST ---');
console.log(JSON.stringify(pipeline.toAST(), null, 2));

export { pipeline };

import { provisionSqliteDb } from '../src/bin/sqliteProvisioner.js';
import { RequestProcessor } from '../src/services/RequestProcessor.js';

async function runTest() {
    console.log("Provisioning database...");
    const prisma = await provisionSqliteDb("test_state_machine", true); // true to force reset
    
    // Resolve user and project
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("No user found");
    const project = await prisma.project.findFirst({ where: { id: 'system' } });
    if (!project) throw new Error("No system project found");
    
    let conversation = await prisma.conversation.findFirst({ where: { userId: user.id } });
    if (!conversation) {
      conversation = await prisma.conversation.create({ data: { userId: user.id } });
    }

    const ast = pipeline.toAST();
    
    console.log("Creating request...");
    const request = await prisma.request.create({
      data: {
        userId: user.id,
        projectId: project.id,
        conversationId: conversation.id,
        toolName: 'AST_Root',
        ast,
        status: 'NEW'
      }
    });

    console.log("Executing RequestProcessor...");
    const processor = new RequestProcessor(prisma as any);
    processor.isAdHoc = true;
    await processor.processRequest(request as any);

    // Retrieve and display responses
    const responses = await prisma.response.findMany({
      where: { requestId: request.id },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`--- RESPONSES ---`);
    for (const res of responses) {
      console.log(`Response:`, res.content);
    }
    console.log('-----------------');
    
    await prisma.$disconnect();
}

runTest().catch(console.error);


