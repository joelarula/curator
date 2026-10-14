import { describe, it, expect } from 'vitest';
import { CuratorBuilder as b } from '../../curator/dist/src/index.js';
import { CuratorMermaid, CuratorWorkflow } from '../../curator/dist/src/index.js';

describe('Curator Tri-Modal Shape: CoffeeScript <-> AST <-> Mermaid', () => {

    describe('1. AST to Mermaid Flowchart Conversion', () => {
        it('should render a sequential workflow with correct styling', () => {
            const ast = b.seq(
                'pipeline',
                b.tool('fetch_html', { url: 'https://example.com' }),
                b.agent({ agentName: 'Extractor', prompt: 'Extract headings' }),
                b.tool('save_results', { format: 'json' })
            );

            const mermaid = CuratorMermaid.astToMermaid(ast);

            expect(mermaid).toContain('flowchart TD');
            expect(mermaid).toContain('classDef toolStyle');
            expect(mermaid).toContain('classDef agentStyle');
            expect(mermaid).toContain('fetch_html');
            expect(mermaid).toContain('Extractor');
            expect(mermaid).toContain('save_results');
            expect(mermaid).toContain('-->');
        });

        it('should render parallel fork & join topologies', () => {
            const ast = b.parallel(
                'concurrent_analysis',
                b.tool('analyze_sentiment'),
                b.tool('extract_entities')
            );

            const mermaid = CuratorMermaid.astToMermaid(ast);

            expect(mermaid).toContain('Fork: concurrent_analysis');
            expect(mermaid).toContain('Join');
            expect(mermaid).toContain('analyze_sentiment');
            expect(mermaid).toContain('extract_entities');
        });

        it('should render conditional branching (if-else)', () => {
            const ast = b.ifElse(
                'context.state.score > 80',
                b.agent({ agentName: 'SeniorReviewer', prompt: 'High score review' }),
                b.tool('archive_submission')
            );

            const mermaid = CuratorMermaid.astToMermaid(ast);

            expect(mermaid).toContain('context.state.score > 80');
            expect(mermaid).toContain('|then|');
            expect(mermaid).toContain('|else|');
            expect(mermaid).toContain('SeniorReviewer');
            expect(mermaid).toContain('archive_submission');
        });

        it('should render loops (while & forEach) with feedback cycle edges', () => {
            const whileAst = b.whileLoop(
                'context.turn <= 5',
                b.tool('process_turn', { turn: 'context.turn' })
            );

            const mermaid = CuratorMermaid.astToMermaid(whileAst);

            expect(mermaid).toContain('while: context.turn <= 5');
            expect(mermaid).toContain('|loop|');
            expect(mermaid).toContain('|repeat|');
            expect(mermaid).toContain('((Done))');
        });

        it('should render event signals and human input nodes', () => {
            const ast = b.seq(
                'event_flow',
                b.humanInput('Please confirm batch deployment', 'choices', ['yes', 'no']),
                b.emitEvent('deploy:approved', { timestamp: 12345 }),
                b.waitEvent('deploy:completed')
            );

            const mermaid = CuratorMermaid.astToMermaid(ast);

            expect(mermaid).toContain('Human: Please confirm batch deployment');
            expect(mermaid).toContain('Emit: deploy:approved');
            expect(mermaid).toContain('Wait: deploy:completed');
        });
    });

    describe('2. Universal CuratorWorkflow Tri-Modal Bridge', () => {
        it('should compile CoffeeScript directly to AST and render to Mermaid', async () => {
            const coffeeSource = `
seq "github_workflow",
  tool("fetch_repo", repo: "joelarula/curator"),
  if_else("context.fetch_repo.isPrivate",
    tool("request_access"),
    agent(agentName: "Summarizer", prompt: "Summarize readme")
  )
`;


            const workflow = await CuratorWorkflow.fromCoffee(coffeeSource);

            // 1. AST Shape
            const ast = workflow.toAst();
            expect(ast.type).toBe('Curator_Sequential');

            // 2. Mermaid Shape
            const mermaid = workflow.toMermaid();
            expect(mermaid).toContain('fetch_repo');
            expect(mermaid).toContain('context.fetch_repo.isPrivate');
            expect(mermaid).toContain('Summarizer');
            expect(mermaid).toContain('request_access');
        });

        it('should parse simple Mermaid flowcharts back into an executable AST', () => {
            const mermaidCode = `
flowchart TD
  A["🔧 tool: fetch_data"] --> B(["🤖 agent: Analyst"])
`;

            const workflow = CuratorWorkflow.fromMermaid(mermaidCode);
            const ast = workflow.toAst();

            expect(ast.type).toBe('Curator_Sequential');
            const subAgents = (ast as any).subAgents;
            expect(subAgents.length).toBe(2);
            expect(subAgents[0].type).toBe('Curator_Tool');
            expect(subAgents[0].toolName).toBe('fetch_data');
            expect(subAgents[1].type).toBe('Curator_Agent');
            expect(subAgents[1].agentName).toBe('Analyst');
        });
    });

    describe('3. Multi-Agent Sequence Diagrams & State Machines', () => {
        it('should render a multi-agent sequence diagram with secrets and event signals', () => {
            const ast = b.seq(
                'poker_round',
                b.tool('deal_cards', { secretKey: '$secret:PLAYER_SECRET' }),
                b.agent({ agentName: 'PlayerAlice', prompt: 'Choose bet or fold' }),
                b.agent({ agentName: 'PlayerBob', prompt: 'React to Alice' }),
                b.emitEvent('table:pot_raised', { amount: 100 })
            );

            const seqDiagram = CuratorMermaid.astToSequenceDiagram(ast);

            expect(seqDiagram).toContain('sequenceDiagram');
            expect(seqDiagram).toContain('autonumber');
            expect(seqDiagram).toContain('participant Orch as Curator Orchestrator');
            expect(seqDiagram).toContain('participant Vault as Secret Vault');
            expect(seqDiagram).toContain('participant Tools as Execution Tools');
            expect(seqDiagram).toContain('participant Agent_1 as PlayerAlice');
            expect(seqDiagram).toContain('participant Agent_2 as PlayerBob');
            expect(seqDiagram).toContain('participant Bus as Event Bus');
            expect(seqDiagram).toContain('Resolve secret');
            expect(seqDiagram).toContain('Emit event');
        });

        it('should render a finite state machine diagram (stateDiagram-v2)', () => {
            const ast = b.seq(
                'poker_state_machine',
                b.assign('state.turn', '1'),
                b.parallel(
                    'concurrent_checks',
                    b.tool('verify_blinds'),
                    b.tool('check_chip_stacks')
                ),
                b.ifElse(
                    'context.hasActivePlayers',
                    b.agent({ agentName: 'Dealer', prompt: 'Deal community cards' }),
                    b.tool('end_hand')
                )
            );

            const stateDiagram = CuratorMermaid.astToStateDiagram(ast);

            expect(stateDiagram).toContain('stateDiagram-v2');
            expect(stateDiagram).toContain('[*] -->');
            expect(stateDiagram).toContain('<<fork>>');
            expect(stateDiagram).toContain('<<join>>');
            expect(stateDiagram).toContain('<<choice>>');
            expect(stateDiagram).toContain('--> [*]');
        });

        it('should generate the canonical barebones Prisma ERD', () => {
            const erd = CuratorMermaid.getPrismaErd();

            expect(erd).toContain('erDiagram');
            expect(erd).toContain('PROJECT ||--o{ REQUEST');
            expect(erd).toContain('CONVERSATION ||--o{ REQUEST');
            expect(erd).toContain('REQUEST ||--o{ RESPONSE');
            expect(erd).toContain('AGENT ||--o{ AGENT_WORKFLOW');
            expect(erd).toContain('Formal Execution AST');
            expect(erd).toContain('Hydrated Context State');
        });
    });
});

