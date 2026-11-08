import { compileCoffeeScriptToAST } from './CoffeeVerbs.js';
import type { CuratorAstNode } from './CuratorAst.js';
import type { ILlmProvider, LlmMessage } from './llm/ILlmProvider.js';
import { GuardrailService, MitreAtlasTag } from '../services/GuardrailService.js';

export interface WorkflowSynthesisTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface WorkflowSynthesisOptions {
  llmProvider: ILlmProvider;
  model?: string;
  tools?: WorkflowSynthesisTool[];
  maxRetries?: number;
  systemContext?: string;
  ingressGuardrails?: boolean;
}

export interface WorkflowSynthesisResult {
  coffeeSource: string;
  ast: CuratorAstNode;
  iterations: number;
}

/**
 * Extracts raw CoffeeScript source code from model text, stripping markdown code fences if present.
 */
export function extractCoffeeScript(text: string): string {
  if (!text) return '';
  const match = text.match(/```(?:coffeescript|coffee)?\s*([\s\S]*?)```/i);
  return (match ? match[1] : text).trim();
}

/**
 * Builds the system prompt describing Curator CoffeeScript verbs and available tools.
 */
export function buildWorkflowSynthesizerSystemPrompt(tools: WorkflowSynthesisTool[] = [], extraContext?: string): string {
  const toolsFormatted = tools.length > 0
    ? tools.map((t) => {
        const schema = t.parameters ? ` - Parameters: ${JSON.stringify(t.parameters)}` : '';
        return `* \`${t.name}\`: ${t.description}${schema}`;
      }).join('\n')
    : '(No custom tools provided. You may use generic tools or orchestration verbs)';

  return `You are Curator Workflow Synthesizer, an expert system that translates natural language instructions into executable Curator CoffeeScript workflows.

### SYNTAX RULES:
1. Output ONLY valid, clean CoffeeScript using Curator's natural verbs.
2. Use 2-space indentation.
3. Minimize punctuation (do not use parentheses '()' or curly braces '{}' for calls where CoffeeScript indentation suffices).
4. Do NOT output explanations, introductory text, or markdown prose outside the CoffeeScript code block.

### AVAILABLE VERBS:
- \`seq "pipeline_name",\`: Runs child steps in sequential order.
- \`tool "tool_name", arg1: val1, arg2: val2\`: Executes a registered tool.
- \`set_state key1: val1, key2: val2\`: Updates workflow state variables.
- \`assign "state.targetKey", expr\`: Assigns an expression or transformation to state.
- \`for_each "{{collection}}", (item) ->\`: Iterates over an array in state or prior step output.
- \`if_else "{{condition}}", thenBranch, elseBranch\`: Evaluates a condition and branches.
- \`parallel "branch_name", ...\`: Runs child branches concurrently.
- \`prompt "question", "text" | "choices", [choices]\`: Pauses for human input or interactive choice.
- \`emit_event "event_name", payload\`: Emits a pub/sub domain event.
- \`wait_event "event_name"\`: Suspends until a specific event is received.

### INTERPOLATION & SCOPE:
- Use \`"{{tool_name.property}}"\` or \`"{{item.property}}"\` or \`"{{state.property}}"\` for dynamic templated values.

### REGISTERED TOOLS:
${toolsFormatted}

${extraContext ? `### ADDITIONAL DOMAIN CONTEXT:\n${extraContext}\n` : ''}
### EXAMPLE OUTPUT:
\`\`\`coffeescript
seq "daily_report_pipeline",
  set_state status: "starting"
  tool "fetch_leads", minScore: 80
  for_each "{{fetch_leads.items}}", (item) ->
    if_else "{{item.isQualified}}",
      tool "send_notification",
        recipient: "{{item.email}}"
        message: "Your lead score is qualified."
  set_state status: "completed"
\`\`\`
`.trim();
}

/**
 * Translates natural language instructions into a validated Curator Execution AST
 * using an LLM and the CoffeeScript verbs compiler with automated self-repair.
 */
export async function synthesizeWorkflow(
  instruction: string,
  options: WorkflowSynthesisOptions
): Promise<WorkflowSynthesisResult> {
  const {
    llmProvider,
    model,
    tools = [],
    maxRetries = 2,
    systemContext,
    ingressGuardrails = true,
  } = options;

  if (!instruction || !instruction.trim()) {
    throw new Error('Instruction prompt cannot be empty.');
  }

  // 1. Guardrail Ingress Inspection (AML.T0051 Prompt Injection & Sanity)
  if (ingressGuardrails) {
    const inspection = await GuardrailService.inspectPromptIngress(instruction);
    if (!inspection.allowed) {
      throw new Error(
        `Workflow synthesis blocked by prompt ingress guardrail: ${inspection.reason || 'Security violation'} (${inspection.atlasTag || MitreAtlasTag.PROMPT_INJECTION})`
      );
    }
  }

  // 2. Build system prompt
  const systemPrompt = buildWorkflowSynthesizerSystemPrompt(tools, systemContext);

  const messages: LlmMessage[] = [
    {
      role: 'user',
      content: instruction.trim(),
    },
  ];

  let lastError: Error | null = null;

  // 3. Synthesis & Self-Repair Loop
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const resp = await llmProvider.generateContent({
      model,
      systemPrompt,
      messages,
      temperature: 0.1,
    });

    const rawText = resp.text || '';
    const coffeeSource = extractCoffeeScript(rawText);

    if (!coffeeSource) {
      lastError = new Error('Model produced empty output or no recognizable code block.');
      if (attempt < maxRetries) {
        messages.push({ role: 'assistant', content: rawText });
        messages.push({
          role: 'user',
          content: 'You did not output any CoffeeScript code. Please generate the workflow using valid CoffeeScript verbs.',
        });
        continue;
      }
      break;
    }

    try {
      // 4. Deterministic compilation into Formal Curator Execution AST
      const ast = await compileCoffeeScriptToAST(coffeeSource);
      return {
        coffeeSource,
        ast,
        iterations: attempt,
      };
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        // Feedback loop: ask model to fix the exact compiler error
        messages.push({ role: 'assistant', content: rawText });
        messages.push({
          role: 'user',
          content: `The generated CoffeeScript caused a compilation error:\n"${err.message}"\n\nPlease fix the script. Return ONLY the corrected CoffeeScript code.`,
        });
      }
    }
  }

  throw new Error(
    `Failed to synthesize valid workflow AST after ${maxRetries} attempt(s). Last error: ${lastError?.message}`
  );
}
