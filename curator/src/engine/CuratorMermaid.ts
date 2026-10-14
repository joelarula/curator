import type {
  CuratorAstNode,
  CuratorAgentNode,
  CuratorSequentialNode,
  CuratorParallelNode,
  CuratorToolNode,
  CuratorIfElseNode,
  CuratorWhileNode,
  CuratorForEachNode,
  CuratorLoopNode,
  CuratorHumanInputNode,
  CuratorEmitEventNode,
  CuratorWaitEventNode,
  CuratorAssignNode,
  CuratorSetStateNode,
  CuratorScriptNode,
  CuratorGraphNode
} from './CuratorAst.js';

export interface MermaidOptions {
  direction?: 'TD' | 'LR' | 'TB';
  includeStyles?: boolean;
  barebones?: boolean;
}

export interface SequenceDiagramOptions {
  autonumber?: boolean;
  barebones?: boolean;
  orchestratorName?: string;
  vaultName?: string;
  toolsName?: string;
  busName?: string;
  userName?: string;
}

interface SubgraphResult {
  entryNodeId: string;
  exitNodeIds: string[];
}

export class CuratorMermaid {
  private idCounter = 0;
  private lines: string[] = [];
  private options: MermaidOptions = {};

  private nextId(prefix = 'node'): string {
    return `${prefix}_${++this.idCounter}`;
  }

  private style(styleClass: string): string {
    if (this.options.includeStyles === false || this.options.barebones) {
      return '';
    }
    return `:::${styleClass}`;
  }

  private icon(emoji: string): string {
    if (this.options.barebones) {
      return '';
    }
    return `${emoji} `;
  }

  private escapeLabel(text: string): string {
    if (!text) return '';
    return text
      .replace(/"/g, "'")
      .replace(/[\r\n]+/g, ' ')
      .trim();
  }

  /**
   * Converts any Curator Execution AST into a standard Mermaid flowchart.
   */
  static astToMermaid(ast: CuratorAstNode, options: MermaidOptions = {}): string {
    const generator = new CuratorMermaid();
    return generator.generate(ast, options);
  }

  /**
   * Converts any Curator Execution AST into a standard Mermaid sequence diagram.
   */
  static astToSequenceDiagram(ast: CuratorAstNode, options: SequenceDiagramOptions = {}): string {
    const generator = new CuratorSequenceGenerator();
    return generator.generate(ast, options);
  }

  /**
   * Converts any Curator Execution AST into a Mermaid state machine diagram (stateDiagram-v2).
   */
  static astToStateDiagram(ast: CuratorAstNode): string {
    const generator = new CuratorStateGenerator();
    return generator.generate(ast);
  }

  /**
   * Generates a barebones Mermaid ERD diagram representing the Curator Prisma schema.
   */
  static getPrismaErd(): string {
    return [
      'erDiagram',
      '  PROJECT ||--o{ REQUEST : scopes',
      '  PROJECT ||--o{ RESPONSE : scopes',
      '  PROJECT ||--o{ AGENT : contains',
      '  PROJECT ||--o{ SCHEDULED_AGENT : contains',
      '  PROJECT ||--o{ RESOURCE : groups',
      '  PROJECT ||--o{ RELATION : groups',
      '',
      '  USER ||--o{ PROJECT : owns',
      '  USER ||--o{ CONVERSATION : initiates',
      '  USER ||--o{ REQUEST : creates',
      '  USER ||--o{ AGENT : owns',
      '',
      '  CONVERSATION ||--o{ REQUEST : tracks',
      '  CONVERSATION ||--o{ RESPONSE : records',
      '  CONVERSATION ||--o{ EVENT_SUBSCRIPTION : listens',
      '',
      '  REQUEST ||--o{ RESPONSE : generates',
      '  REQUEST ||--o| REQUEST : "notifies / joins"',
      '',
      '  AGENT ||--o{ AGENT_WORKFLOW : executes',
      '  AGENT_WORKFLOW ||--o{ EVENT_SUBSCRIPTION : triggers',
      '  AGENT_WORKFLOW ||--o{ SCHEDULED_AGENT : scheduled_by',
      '',
      '  RESOURCE ||--o{ RELATION : "subject / predicate / object"',
      '  RESOURCE ||--o{ ATTACHMENT : contains',
      '',
      '  PROJECT {',
      '    int id PK',
      '    string name',
      '    int userId FK',
      '    boolean existent',
      '    datetime createdAt',
      '    datetime updatedAt',
      '  }',
      '',
      '  CONVERSATION {',
      '    string id PK',
      '    int userId FK',
      '    json state',
      '    datetime createdAt',
      '    datetime updatedAt',
      '  }',
      '',
      '  REQUEST {',
      '    int id PK',
      '    string status "NEW | RUNNING | COMPLETED | FAILED"',
      '    string toolName',
      '    int userId FK',
      '    int projectId FK',
      '    string conversationId FK',
      '    json ast "Formal Execution AST"',
      '    json context "Hydrated Context State"',
      '    int priority',
      '    string lockedBy',
      '    datetime scheduledAt',
      '    int retryCount',
      '    int notifyId FK "Parent Join ID"',
      '    int pendingDependencies',
      '  }',
      '',
      '  RESPONSE {',
      '    int id PK',
      '    int requestId FK',
      '    int projectId FK',
      '    string conversationId FK',
      '    int userId FK',
      '    string content "Scrubbed Egress Response"',
      '    datetime createdAt',
      '  }',
      '',
      '  AGENT {',
      '    int id PK',
      '    string name UK',
      '    string description',
      '    int userId FK',
      '    int projectId FK',
      '  }',
      '',
      '  AGENT_WORKFLOW {',
      '    int id PK',
      '    string name UK',
      '    string description',
      '    json ast "Compiled Workflow AST"',
      '    string sourceCode "CoffeeScript Source"',
      '    int agentId FK',
      '  }',
      '',
      '  EVENT_SUBSCRIPTION {',
      '    int id PK',
      '    string eventName',
      '    int agentWorkflowId FK',
      '    json workflowAst',
      '    string conversationId FK',
      '    boolean isActive',
      '  }',
      '',
      '  SCHEDULED_AGENT {',
      '    int id PK',
      '    string name',
      '    string workflowName FK',
      '    json workflowParams',
      '    string schedule "Cron Expression"',
      '    boolean runOnce',
      '    datetime runAt',
      '    boolean isActive',
      '  }',
      '',
      '  RESOURCE {',
      '    int id PK',
      '    string uri UK',
      '    string title',
      '    string description',
      '    int userId FK',
      '    int projectId FK',
      '  }',
      '',
      '  RELATION {',
      '    int id PK',
      '    int subjectId FK',
      '    int predicateId FK',
      '    int objectId FK',
      '    float literalValue',
      '    datetime literalDate',
      '  }'
    ].join('\n');
  }

  /**
   * Generates flowchart string from an AST.
   */
  generate(ast: CuratorAstNode, options: MermaidOptions = {}): string {
    this.idCounter = 0;
    this.lines = [];
    this.options = options;

    const direction = options.direction || 'TD';
    this.lines.push(`flowchart ${direction}`);

    if (options.includeStyles !== false && !options.barebones) {
      this.lines.push('  %% Styling classes');
      this.lines.push('  classDef toolStyle fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;');
      this.lines.push('  classDef agentStyle fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#f8fafc;');
      this.lines.push('  classDef condStyle fill:#1c1917,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;');
      this.lines.push('  classDef eventStyle fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#f8fafc;');
      this.lines.push('  classDef inputStyle fill:#4a044e,stroke:#f472b6,stroke-width:2px,color:#f8fafc;');
      this.lines.push('  classDef stateStyle fill:#1e293b,stroke:#94a3b8,stroke-width:2px,color:#f8fafc;');
      this.lines.push('  classDef forkStyle fill:#0f172a,stroke:#64748b,stroke-width:1px,stroke-dasharray: 5 5,color:#cbd5e1;');
    }

    this.renderNode(ast);
    return this.lines.join('\n');
  }

  private renderNode(node: CuratorAstNode): SubgraphResult {
    if (!node || !node.type) {
      const id = this.nextId('unknown');
      this.lines.push(`  ${id}["Unknown Node"]`);
      return { entryNodeId: id, exitNodeIds: [id] };
    }

    switch (node.type) {
      case 'Curator_Tool':
        return this.renderTool(node as CuratorToolNode);

      case 'Curator_Agent':
        return this.renderAgent(node as CuratorAgentNode);

      case 'Curator_Sequential':
        return this.renderSequential(node as CuratorSequentialNode);

      case 'Curator_Parallel':
        return this.renderParallel(node as CuratorParallelNode);

      case 'Curator_IfElse':
        return this.renderIfElse(node as CuratorIfElseNode);

      case 'Curator_While':
        return this.renderWhile(node as CuratorWhileNode);

      case 'Curator_ForEach':
        return this.renderForEach(node as CuratorForEachNode);

      case 'Curator_Loop':
        return this.renderLoop(node as CuratorLoopNode);

      case 'Curator_HumanInput':
        return this.renderHumanInput(node as CuratorHumanInputNode);

      case 'Curator_EmitEvent':
        return this.renderEmitEvent(node as CuratorEmitEventNode);

      case 'Curator_WaitEvent':
        return this.renderWaitEvent(node as CuratorWaitEventNode);

      case 'Curator_Assign':
        return this.renderAssign(node as CuratorAssignNode);

      case 'Curator_SetState':
        return this.renderSetState(node as CuratorSetStateNode);

      case 'Curator_Script':
        return this.renderScript(node as CuratorScriptNode);

      case 'Curator_Graph':
        return this.renderGraph(node as CuratorGraphNode);

      default: {
        const id = this.nextId('node');
        this.lines.push(`  ${id}["${this.escapeLabel(node.type)}"]`);
        return { entryNodeId: id, exitNodeIds: [id] };
      }
    }
  }

  private renderTool(node: CuratorToolNode): SubgraphResult {
    const id = this.nextId('tool');
    const label = this.escapeLabel(node.toolName || 'tool');
    let argsSummary = '';
    if (node.args && Object.keys(node.args).length > 0) {
      const keys = Object.keys(node.args).slice(0, 3).join(', ');
      argsSummary = ` (${keys})`;
    }
    this.lines.push(`  ${id}["${this.icon('🔧')}${label}${argsSummary}"]${this.style('toolStyle')}`);
    return { entryNodeId: id, exitNodeIds: [id] };
  }

  private renderAgent(node: CuratorAgentNode): SubgraphResult {
    const id = this.nextId('agent');
    const name = this.escapeLabel(node.agentName || 'Agent');
    const model = node.model ? ` (${this.escapeLabel(node.model)})` : '';
    this.lines.push(`  ${id}(["${this.icon('🤖')}${name}${model}"])${this.style('agentStyle')}`);
    return { entryNodeId: id, exitNodeIds: [id] };
  }

  private renderSequential(node: CuratorSequentialNode): SubgraphResult {
    const subAgents = node.subAgents || [];
    if (subAgents.length === 0) {
      const id = this.nextId('seq_empty');
      this.lines.push(`  ${id}["Empty Sequence"]`);
      return { entryNodeId: id, exitNodeIds: [id] };
    }

    const subResults: SubgraphResult[] = [];
    for (const child of subAgents) {
      subResults.push(this.renderNode(child));
    }

    // Connect sequential chain
    for (let i = 0; i < subResults.length - 1; i++) {
      const current = subResults[i];
      const next = subResults[i + 1];
      for (const exitId of current.exitNodeIds) {
        this.lines.push(`  ${exitId} --> ${next.entryNodeId}`);
      }
    }

    return {
      entryNodeId: subResults[0].entryNodeId,
      exitNodeIds: subResults[subResults.length - 1].exitNodeIds
    };
  }

  private renderParallel(node: CuratorParallelNode): SubgraphResult {
    const subAgents = node.subAgents || [];
    const forkId = this.nextId('fork');
    const joinId = this.nextId('join');
    const name = this.escapeLabel(node.name || 'Parallel');

    this.lines.push(`  ${forkId}{{"${this.icon('⚡')}Fork: ${name}"}}${this.style('forkStyle')}`);
    this.lines.push(`  ${joinId}{{"${this.icon('🤝')}Join"}}${this.style('forkStyle')}`);

    if (subAgents.length === 0) {
      this.lines.push(`  ${forkId} --> ${joinId}`);
      return { entryNodeId: forkId, exitNodeIds: [joinId] };
    }

    for (const child of subAgents) {
      const childRes = this.renderNode(child);
      this.lines.push(`  ${forkId} --> ${childRes.entryNodeId}`);
      for (const exitId of childRes.exitNodeIds) {
        this.lines.push(`  ${exitId} --> ${joinId}`);
      }
    }

    return { entryNodeId: forkId, exitNodeIds: [joinId] };
  }

  private renderIfElse(node: CuratorIfElseNode): SubgraphResult {
    const condId = this.nextId('if');
    const condLabel = this.escapeLabel(node.condition || 'condition');
    this.lines.push(`  ${condId}{"${this.icon('❓')}${condLabel}"}${this.style('condStyle')}`);

    const exitNodes: string[] = [];

    // Then branch
    if (node.thenBranch) {
      const thenRes = this.renderNode(node.thenBranch);
      this.lines.push(`  ${condId} -->|then| ${thenRes.entryNodeId}`);
      exitNodes.push(...thenRes.exitNodeIds);
    } else {
      exitNodes.push(condId);
    }

    // Else branch
    if (node.elseBranch) {
      const elseRes = this.renderNode(node.elseBranch);
      this.lines.push(`  ${condId} -->|else| ${elseRes.entryNodeId}`);
      exitNodes.push(...elseRes.exitNodeIds);
    } else {
      // Direct false exit
      exitNodes.push(condId);
    }

    return { entryNodeId: condId, exitNodeIds: exitNodes };
  }

  private renderWhile(node: CuratorWhileNode): SubgraphResult {
    const whileId = this.nextId('while');
    const condLabel = this.escapeLabel(node.condition || 'condition');
    this.lines.push(`  ${whileId}{"${this.icon('🔁')}while: ${condLabel}"}${this.style('condStyle')}`);

    if (node.body) {
      const bodyRes = this.renderNode(node.body);
      this.lines.push(`  ${whileId} -->|loop| ${bodyRes.entryNodeId}`);
      for (const exitId of bodyRes.exitNodeIds) {
        this.lines.push(`  ${exitId} -.->|repeat| ${whileId}`);
      }
    }

    const doneId = this.nextId('done');
    this.lines.push(`  ${whileId} -->|done| ${doneId}((Done))`);
    return { entryNodeId: whileId, exitNodeIds: [doneId] };
  }

  private renderForEach(node: CuratorForEachNode): SubgraphResult {
    const forId = this.nextId('foreach');
    const iter = node.iteratorName || 'item';
    const coll = this.escapeLabel(node.collectionExpression || 'collection');
    this.lines.push(`  ${forId}{{"${this.icon('🔄')}for ${iter} in ${coll}"}}${this.style('condStyle')}`);

    if (node.body) {
      const bodyRes = this.renderNode(node.body);
      this.lines.push(`  ${forId} -->|each| ${bodyRes.entryNodeId}`);
      for (const exitId of bodyRes.exitNodeIds) {
        this.lines.push(`  ${exitId} -.->|next| ${forId}`);
      }
    }

    const doneId = this.nextId('done');
    this.lines.push(`  ${forId} -->|done| ${doneId}((Done))`);
    return { entryNodeId: forId, exitNodeIds: [doneId] };
  }

  private renderLoop(node: CuratorLoopNode): SubgraphResult {
    const loopId = this.nextId('loop');
    const max = node.maxIterations ? ` (max: ${node.maxIterations})` : '';
    this.lines.push(`  ${loopId}{{"${this.icon('🔁')}Loop${max}"}}${this.style('condStyle')}`);

    if (node.agent) {
      const agentRes = this.renderNode(node.agent);
      this.lines.push(`  ${loopId} --> ${agentRes.entryNodeId}`);
      for (const exitId of agentRes.exitNodeIds) {
        this.lines.push(`  ${exitId} -.->|repeat| ${loopId}`);
      }
    }

    return { entryNodeId: loopId, exitNodeIds: [loopId] };
  }

  private renderHumanInput(node: CuratorHumanInputNode): SubgraphResult {
    const id = this.nextId('human');
    const prompt = this.escapeLabel(node.prompt || 'Input requested');
    this.lines.push(`  ${id}[/"${this.icon('👤')}Human: ${prompt}"/]${this.style('inputStyle')}`);
    return { entryNodeId: id, exitNodeIds: [id] };
  }

  private renderEmitEvent(node: CuratorEmitEventNode): SubgraphResult {
    const id = this.nextId('emit');
    const name = this.escapeLabel(node.eventName || 'event');
    this.lines.push(`  ${id}[">${this.icon('⚡')}Emit: ${name}"]${this.style('eventStyle')}`);
    return { entryNodeId: id, exitNodeIds: [id] };
  }

  private renderWaitEvent(node: CuratorWaitEventNode): SubgraphResult {
    const id = this.nextId('wait');
    const name = this.escapeLabel(node.eventName || 'event');
    this.lines.push(`  ${id}[">${this.icon('⏳')}Wait: ${name}"]${this.style('eventStyle')}`);
    return { entryNodeId: id, exitNodeIds: [id] };
  }

  private renderAssign(node: CuratorAssignNode): SubgraphResult {
    const id = this.nextId('assign');
    const key = this.escapeLabel(node.key || 'key');
    const expr = this.escapeLabel(node.expression || 'val');
    this.lines.push(`  ${id}["${this.icon('📝')}${key} = ${expr}"]${this.style('stateStyle')}`);
    return { entryNodeId: id, exitNodeIds: [id] };
  }

  private renderSetState(node: CuratorSetStateNode): SubgraphResult {
    const id = this.nextId('state');
    const keys = node.state ? Object.keys(node.state).join(', ') : '';
    this.lines.push(`  ${id}["${this.icon('📝')}setState(${keys})"]${this.style('stateStyle')}`);
    return { entryNodeId: id, exitNodeIds: [id] };
  }

  private renderScript(node: CuratorScriptNode): SubgraphResult {
    const id = this.nextId('script');
    const lang = node.language || 'script';
    this.lines.push(`  ${id}["${this.icon('📜')}Script (${lang})"]${this.style('stateStyle')}`);
    return { entryNodeId: id, exitNodeIds: [id] };
  }


  private renderGraph(node: CuratorGraphNode): SubgraphResult {
    const graphId = this.nextId('graph');
    this.lines.push(`  subgraph ${graphId} ["Graph: ${this.escapeLabel(node.name || 'Workflow')}"]`);

    const nodeEntries: Record<string, SubgraphResult> = {};
    if (node.nodes) {
      for (const [key, child] of Object.entries(node.nodes)) {
        nodeEntries[key] = this.renderNode(child);
      }
    }

    if (node.edges) {
      for (const [from, target] of Object.entries(node.edges)) {
        const fromRes = nodeEntries[from];
        if (typeof target === 'string') {
          const toRes = nodeEntries[target];
          if (fromRes && toRes) {
            for (const exitId of fromRes.exitNodeIds) {
              this.lines.push(`    ${exitId} --> ${toRes.entryNodeId}`);
            }
          }
        }
      }
    }

    this.lines.push('  end');
    const startRes = node.startNode ? nodeEntries[node.startNode] : Object.values(nodeEntries)[0];
    return startRes || { entryNodeId: graphId, exitNodeIds: [graphId] };
  }

  /**
   * Compiles simple linear Mermaid flowcharts back into an AST.
   */
  static mermaidToAst(mermaidCode: string): CuratorAstNode {
    const segments = mermaidCode
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('flowchart') && !l.startsWith('%%') && !l.startsWith('classDef'))
      .flatMap(l => l.split(/\s*--[->]\s*/));

    const tools: CuratorAstNode[] = [];

    for (const seg of segments) {
      // Match tool node: e.g. A["🔧 tool_name"] or A[tool: tool_name]
      const toolMatch = seg.match(/\["?[^"\]]*?tool:?\s*([a-zA-Z0-9_-]+)/i);
      if (toolMatch) {
        tools.push({
          type: 'Curator_Tool',
          toolName: toolMatch[1]
        });
        continue;
      }

      // Match agent node: e.g. A(["🤖 agent_name"]) or A([agent: agent_name])
      const agentMatch = seg.match(/\(\["?[^"\]]*?agent:?\s*([a-zA-Z0-9_-]+)/i);
      if (agentMatch) {
        tools.push({
          type: 'Curator_Agent',
          agentName: agentMatch[1],
          prompt: `Execute agent ${agentMatch[1]}`
        });
        continue;
      }
    }

    if (tools.length === 1) return tools[0];
    return {
      type: 'Curator_Sequential',
      name: 'CompiledFromMermaid',
      subAgents: tools
    };
  }
}

/**
 * Universal Tri-Modal Workflow:
 * Enables fluid switching between CoffeeScript, AST JSON, and Mermaid diagrams.
 */
export class CuratorWorkflow {
  constructor(public readonly ast: CuratorAstNode) {}

  static async fromCoffee(coffeeCode: string): Promise<CuratorWorkflow> {
    const { compileCoffeeScriptToAST } = await import('./CoffeeVerbs.js');
    const ast = await compileCoffeeScriptToAST(coffeeCode);
    return new CuratorWorkflow(ast);
  }

  static fromAst(ast: CuratorAstNode): CuratorWorkflow {
    return new CuratorWorkflow(ast);
  }

  static fromMermaid(mermaidCode: string): CuratorWorkflow {
    const ast = CuratorMermaid.mermaidToAst(mermaidCode);
    return new CuratorWorkflow(ast);
  }

  toAst(): CuratorAstNode {
    return this.ast;
  }

  toMermaid(options?: MermaidOptions): string {
    return CuratorMermaid.astToMermaid(this.ast, options);
  }

  toSequenceDiagram(options?: SequenceDiagramOptions): string {
    return CuratorMermaid.astToSequenceDiagram(this.ast, options);
  }

  toStateDiagram(): string {
    return CuratorMermaid.astToStateDiagram(this.ast);
  }
}

/**
 * Generates barebones or styled Mermaid sequence diagrams from Curator ASTs.
 */
export class CuratorSequenceGenerator {
  private lines: string[] = [];
  private hasUser = false;
  private hasVault = false;
  private hasTools = false;
  private hasBus = false;
  private agents: Map<string, string> = new Map();
  private options: SequenceDiagramOptions = {};

  private escape(text: string): string {
    if (!text) return '';
    return text
      .replace(/"/g, "'")
      .replace(/[\r\n]+/g, ' ')
      .trim();
  }

  generate(ast: CuratorAstNode, options: SequenceDiagramOptions = {}): string {
    this.options = options;
    this.lines = [];
    this.hasUser = false;
    this.hasVault = false;
    this.hasTools = false;
    this.hasBus = false;
    this.agents.clear();

    this.inspect(ast);

    this.lines.push('sequenceDiagram');
    if (options.autonumber !== false) {
      this.lines.push('  autonumber');
    }

    if (this.hasUser) {
      const userLabel = options.userName || 'Human Approver';
      this.lines.push(`  actor User as ${userLabel}`);
    }

    const orchLabel = options.orchestratorName || 'Curator Orchestrator';
    this.lines.push(`  participant Orch as ${orchLabel}`);

    if (this.hasVault) {
      const vaultLabel = options.vaultName || 'Secret Vault';
      this.lines.push(`  participant Vault as ${vaultLabel}`);
    }

    if (this.hasTools) {
      const toolsLabel = options.toolsName || 'Execution Tools';
      this.lines.push(`  participant Tools as ${toolsLabel}`);
    }

    for (const [name, id] of this.agents.entries()) {
      this.lines.push(`  participant ${id} as ${name}`);
    }

    if (this.hasBus) {
      const busLabel = options.busName || 'Event Bus';
      this.lines.push(`  participant Bus as ${busLabel}`);
    }

    this.renderNode(ast, '  ');
    return this.lines.join('\n');
  }

  private inspect(node: CuratorAstNode): void {
    if (!node) return;
    switch (node.type) {
      case 'Curator_Tool': {
        this.hasTools = true;
        const toolNode = node as CuratorToolNode;
        if (toolNode.args) {
          const str = JSON.stringify(toolNode.args);
          if (str.includes('$secret:') || str.includes('{{secrets.') || str.includes('secret://')) {
            this.hasVault = true;
          }
        }
        break;
      }
      case 'Curator_Agent': {
        const agentNode = node as CuratorAgentNode;
        const name = agentNode.agentName || 'Agent';
        const id = `Agent_${this.agents.size + 1}`;
        if (!this.agents.has(name)) {
          this.agents.set(name, id);
        }
        break;
      }
      case 'Curator_HumanInput': {
        this.hasUser = true;
        break;
      }
      case 'Curator_EmitEvent':
      case 'Curator_WaitEvent': {
        this.hasBus = true;
        break;
      }
      case 'Curator_Sequential':
      case 'Curator_Parallel': {
        const group = node as CuratorSequentialNode | CuratorParallelNode;
        for (const child of group.subAgents || []) {
          this.inspect(child);
        }
        break;
      }
      case 'Curator_IfElse': {
        const ifElse = node as CuratorIfElseNode;
        if (ifElse.thenBranch) this.inspect(ifElse.thenBranch);
        if (ifElse.elseBranch) this.inspect(ifElse.elseBranch);
        break;
      }
      case 'Curator_While':
      case 'Curator_ForEach': {
        const loop = node as CuratorWhileNode | CuratorForEachNode;
        if (loop.body) this.inspect(loop.body);
        break;
      }
      case 'Curator_Loop': {
        const loop = node as CuratorLoopNode;
        if (loop.agent) this.inspect(loop.agent);
        break;
      }
      case 'Curator_Graph': {
        const graph = node as CuratorGraphNode;
        if (graph.nodes) {
          for (const child of Object.values(graph.nodes)) {
            this.inspect(child);
          }
        }
        break;
      }
    }
  }

  private renderNode(node: CuratorAstNode, indent: string): void {
    if (!node) return;

    switch (node.type) {
      case 'Curator_Assign': {
        const assign = node as CuratorAssignNode;
        this.lines.push(`${indent}Note over Orch: ${this.escape(assign.key)} = ${this.escape(assign.expression)}`);
        break;
      }

      case 'Curator_SetState': {
        const setState = node as CuratorSetStateNode;
        const keys = setState.state ? Object.keys(setState.state).join(', ') : '';
        this.lines.push(`${indent}Note over Orch: setState(${this.escape(keys)})`);
        break;
      }

      case 'Curator_Tool': {
        const tool = node as CuratorToolNode;
        const toolName = this.escape(tool.toolName || 'tool');

        if (tool.args) {
          for (const [key, val] of Object.entries(tool.args)) {
            if (typeof val === 'string') {
              const secretMatch = val.match(/^\$secret:(.+)$/) || val.match(/^{{secrets\.(.+)}}$/);
              if (secretMatch) {
                this.lines.push(`${indent}Orch->>Vault: Resolve secret '${secretMatch[1]}'`);
                this.lines.push(`${indent}Vault-->>Orch: Injected '${secretMatch[1]}' into isolated context`);
              }
            }
          }
        }

        let argsSummary = '';
        if (tool.args && Object.keys(tool.args).length > 0) {
          const pairs = Object.entries(tool.args).slice(0, 3).map(([k, v]) => {
            if (typeof v === 'string' && v.startsWith('$secret:')) {
              return `${k}: secret(...)`;
            }
            return `${k}: ${typeof v === 'string' ? `'${this.escape(v)}'` : JSON.stringify(v)}`;
          });
          argsSummary = pairs.join(', ');
        }

        this.lines.push(`${indent}Orch->>Tools: ${toolName}(${argsSummary})`);
        this.lines.push(`${indent}Tools-->>Orch: ${toolName} completed`);
        break;
      }

      case 'Curator_Agent': {
        const agent = node as CuratorAgentNode;
        const name = agent.agentName || 'Agent';
        const agentId = this.agents.get(name) || 'Agent';
        const prompt = agent.prompt ? `: ${this.escape(agent.prompt)}` : '';
        this.lines.push(`${indent}Orch->>${agentId}: Prompt${prompt}`);
        this.lines.push(`${indent}${agentId}-->>Orch: Reasoning & outputs`);
        break;
      }

      case 'Curator_HumanInput': {
        const human = node as CuratorHumanInputNode;
        const prompt = this.escape(human.prompt || 'Input requested');
        this.lines.push(`${indent}Orch->>User: HumanInput: ${prompt}`);
        this.lines.push(`${indent}User-->>Orch: Input response received`);
        break;
      }

      case 'Curator_EmitEvent': {
        const emit = node as CuratorEmitEventNode;
        this.lines.push(`${indent}Orch->>Bus: Emit event '${this.escape(emit.eventName)}'`);
        break;
      }

      case 'Curator_WaitEvent': {
        const wait = node as CuratorWaitEventNode;
        this.lines.push(`${indent}Bus-->>Orch: Wait for event '${this.escape(wait.eventName)}'`);
        break;
      }

      case 'Curator_Sequential': {
        const seq = node as CuratorSequentialNode;
        for (const child of seq.subAgents || []) {
          this.renderNode(child, indent);
        }
        break;
      }

      case 'Curator_Parallel': {
        const par = node as CuratorParallelNode;
        const name = this.escape(par.name || 'Concurrent execution');
        const subAgents = par.subAgents || [];
        if (subAgents.length === 0) break;

        this.lines.push(`${indent}par ${name}`);
        for (let i = 0; i < subAgents.length; i++) {
          if (i > 0) {
            this.lines.push(`${indent}and`);
          }
          this.renderNode(subAgents[i], `${indent}  `);
        }
        this.lines.push(`${indent}end`);
        break;
      }

      case 'Curator_IfElse': {
        const ifElse = node as CuratorIfElseNode;
        const cond = this.escape(ifElse.condition || 'condition');
        this.lines.push(`${indent}alt ${cond}`);
        if (ifElse.thenBranch) {
          this.renderNode(ifElse.thenBranch, `${indent}  `);
        }
        if (ifElse.elseBranch) {
          this.lines.push(`${indent}else`);
          this.renderNode(ifElse.elseBranch, `${indent}  `);
        }
        this.lines.push(`${indent}end`);
        break;
      }

      case 'Curator_While': {
        const wh = node as CuratorWhileNode;
        const cond = this.escape(wh.condition || 'condition');
        this.lines.push(`${indent}loop while ${cond}`);
        if (wh.body) {
          this.renderNode(wh.body, `${indent}  `);
        }
        this.lines.push(`${indent}end`);
        break;
      }

      case 'Curator_ForEach': {
        const fe = node as CuratorForEachNode;
        const iter = this.escape(fe.iteratorName || 'item');
        const coll = this.escape(fe.collectionExpression || 'items');
        this.lines.push(`${indent}loop for ${iter} in ${coll}`);
        if (fe.body) {
          this.renderNode(fe.body, `${indent}  `);
        }
        this.lines.push(`${indent}end`);
        break;
      }

      case 'Curator_Loop': {
        const loop = node as CuratorLoopNode;
        const max = loop.maxIterations ? ` up to ${loop.maxIterations} times` : '';
        this.lines.push(`${indent}loop${max}`);
        if (loop.agent) {
          this.renderNode(loop.agent, `${indent}  `);
        }
        this.lines.push(`${indent}end`);
        break;
      }
    }
  }
}

/**
 * Generates Mermaid state diagrams (stateDiagram-v2) from Curator ASTs.
 */
export class CuratorStateGenerator {
  private idCounter = 0;
  private lines: string[] = [];

  private nextId(prefix = 'state'): string {
    return `${prefix}_${++this.idCounter}`;
  }

  private escape(text: string): string {
    if (!text) return '';
    return text
      .replace(/"/g, "'")
      .replace(/[\r\n]+/g, ' ')
      .trim();
  }

  generate(ast: CuratorAstNode): string {
    this.idCounter = 0;
    this.lines = [];
    this.lines.push('stateDiagram-v2');

    const result = this.renderNode(ast);
    this.lines.push(`  [*] --> ${result.entryState}`);
    for (const exit of result.exitStates) {
      this.lines.push(`  ${exit} --> [*]`);
    }

    return this.lines.join('\n');
  }

  private renderNode(node: CuratorAstNode): { entryState: string; exitStates: string[] } {
    if (!node) {
      const id = this.nextId('Idle');
      this.lines.push(`  state ${id}`);
      return { entryState: id, exitStates: [id] };
    }

    switch (node.type) {
      case 'Curator_Tool': {
        const tool = node as CuratorToolNode;
        const id = this.nextId(tool.toolName || 'Tool');
        this.lines.push(`  state ${id} {\n    [*] --> Executing: ${this.escape(tool.toolName)}\n  }`);
        return { entryState: id, exitStates: [id] };
      }

      case 'Curator_Agent': {
        const agent = node as CuratorAgentNode;
        const id = this.nextId(agent.agentName || 'Agent');
        const prompt = agent.prompt ? `Prompt: ${this.escape(agent.prompt).slice(0, 40)}...` : 'Reasoning';
        this.lines.push(`  state ${id} {\n    [*] --> Reasoning: ${prompt}\n  }`);
        return { entryState: id, exitStates: [id] };
      }

      case 'Curator_Sequential': {
        const seq = node as CuratorSequentialNode;
        const subAgents = seq.subAgents || [];
        if (subAgents.length === 0) {
          const id = this.nextId('EmptySequence');
          this.lines.push(`  state ${id}`);
          return { entryState: id, exitStates: [id] };
        }

        const states = subAgents.map(child => this.renderNode(child));
        for (let i = 0; i < states.length - 1; i++) {
          const current = states[i];
          const next = states[i + 1];
          for (const exit of current.exitStates) {
            this.lines.push(`  ${exit} --> ${next.entryState}`);
          }
        }

        return {
          entryState: states[0].entryState,
          exitStates: states[states.length - 1].exitStates
        };
      }

      case 'Curator_Parallel': {
        const par = node as CuratorParallelNode;
        const forkId = this.nextId('fork');
        const joinId = this.nextId('join');
        this.lines.push(`  state ${forkId} <<fork>>`);
        this.lines.push(`  state ${joinId} <<join>>`);

        const subAgents = par.subAgents || [];
        for (const child of subAgents) {
          const childRes = this.renderNode(child);
          this.lines.push(`  ${forkId} --> ${childRes.entryState}`);
          for (const exit of childRes.exitStates) {
            this.lines.push(`  ${exit} --> ${joinId}`);
          }
        }

        return { entryState: forkId, exitStates: [joinId] };
      }

      case 'Curator_IfElse': {
        const ifElse = node as CuratorIfElseNode;
        const choiceId = this.nextId('choice');
        this.lines.push(`  state ${choiceId} <<choice>>`);
        const exitStates: string[] = [];

        if (ifElse.thenBranch) {
          const thenRes = this.renderNode(ifElse.thenBranch);
          this.lines.push(`  ${choiceId} --> ${thenRes.entryState}: ${this.escape(ifElse.condition)} [true]`);
          exitStates.push(...thenRes.exitStates);
        } else {
          exitStates.push(choiceId);
        }

        if (ifElse.elseBranch) {
          const elseRes = this.renderNode(ifElse.elseBranch);
          this.lines.push(`  ${choiceId} --> ${elseRes.entryState}: [false]`);
          exitStates.push(...elseRes.exitStates);
        } else {
          exitStates.push(choiceId);
        }

        return { entryState: choiceId, exitStates };
      }

      case 'Curator_While': {
        const wh = node as CuratorWhileNode;
        const loopId = this.nextId('LoopState');
        const doneId = this.nextId('Done');
        this.lines.push(`  state ${loopId} {\n    [*] --> InLoop: while ${this.escape(wh.condition)}\n  }`);
        this.lines.push(`  state ${doneId}`);

        if (wh.body) {
          const bodyRes = this.renderNode(wh.body);
          this.lines.push(`  ${loopId} --> ${bodyRes.entryState}: condition met`);
          for (const exit of bodyRes.exitStates) {
            this.lines.push(`  ${exit} --> ${loopId}: repeat`);
          }
        }
        this.lines.push(`  ${loopId} --> ${doneId}: condition false`);
        return { entryState: loopId, exitStates: [doneId] };
      }

      case 'Curator_HumanInput': {
        const human = node as CuratorHumanInputNode;
        const id = this.nextId('AwaitingHumanInput');
        this.lines.push(`  state ${id} {\n    [*] --> Prompt: ${this.escape(human.prompt)}\n  }`);
        return { entryState: id, exitStates: [id] };
      }

      case 'Curator_EmitEvent': {
        const emit = node as CuratorEmitEventNode;
        const id = this.nextId('EmitEvent');
        this.lines.push(`  state ${id} {\n    [*] --> Dispatched: ${this.escape(emit.eventName)}\n  }`);
        return { entryState: id, exitStates: [id] };
      }

      case 'Curator_Assign': {
        const assign = node as CuratorAssignNode;
        const id = this.nextId('AssignState');
        this.lines.push(`  state ${id} {\n    [*] --> Set: ${this.escape(assign.key)} = ${this.escape(assign.expression)}\n  }`);
        return { entryState: id, exitStates: [id] };
      }

      default: {
        const id = this.nextId('State');
        this.lines.push(`  state ${id}`);
        return { entryState: id, exitStates: [id] };
      }
    }
  }
}

