import { PrismaClient } from '@prisma/client';
import { ScriptRunner } from '../ScriptRunner.js';
import { compileToAST } from '../ast/compiler.js';

/**
 * execute_script tool — the unified executor for Scripts (formerly PromptTemplates).
 *
 * It looks up a Script by name or ID, or runs an inline script body.
 * 1. If it's a stored script with a 'body' (dynamic logic), it evaluates it via ScriptRunner.
 * 2. If it's a stored script with only 'toolCalls' (static recipe), it uses them directly.
 * 3. If an inline 'body' is provided, it evaluates that.
 * 4. It then spawns the resulting chain as a child Request.
 *
 * Args:
 *   scriptName: Name of the Script (stored).
 *   scriptId:   ID of the Script (stored).
 *   body:       Inline script text (dynamic).
 *   args:       Optional JSON object passed into the script or used for arg materialization.
 */
export async function executeScript(
    args: { scriptName?: string; scriptId?: number; body?: string; args?: Record<string, any> },
    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any
) {
    const { scriptName, scriptId, body: inlineBody, args: scriptArgs = {} } = args;

    let toolCalls: any[] = [];
    let resolvedScriptId: number | null = null;
    let nameForLogging = 'inline';

    if (inlineBody) {
        // 1. DYNAMIC INLINE
        let cleanBody = inlineBody.trim();
        if (cleanBody.includes('```')) {
            const match = cleanBody.match(/```(?:typescript|javascript)?\s*([\s\S]*?)\s*```/);
            if (match) {
                cleanBody = match[1] || '';
            }
        }
        console.log(`[Tools] execute_script: running inline script (${cleanBody.length} chars)`);
        toolCalls = await ScriptRunner.evaluate(cleanBody, scriptArgs, prisma, userId);
    } else {
        // 2. STORED SCRIPT
        const orConditions: any[] = [];
        if (scriptId) orConditions.push({ id: Number(scriptId) });
        if (scriptName) orConditions.push({ userId, name: scriptName });

        const script = await prisma.script.findFirst({
            where: { OR: orConditions }
        });

        if (!script) {
            throw new Error(`execute_script: Script "${scriptName || scriptId}" not found`);
        }

        resolvedScriptId = script.id;
        nameForLogging = script.name;

        if (script.body) {
            // DYNAMIC STORED
            console.log(`[Tools] execute_script: evaluating stored script "${script.name}"...`);
            toolCalls = await ScriptRunner.evaluate(script.body, scriptArgs, prisma, userId);
        } else if (script.toolCalls) {
            // STATIC STORED
            console.log(`[Tools] execute_script: using static tool calls from "${script.name}"`);
            toolCalls = script.toolCalls as any[];
        } else {
            throw new Error(`execute_script: Script "${script.name}" has neither a body nor toolCalls`);
        }
    }

    const isAst = toolCalls && typeof toolCalls === 'object' && !Array.isArray(toolCalls) && (toolCalls as any).type === 'Sequence';
    
    if (!toolCalls || (!Array.isArray(toolCalls) && !isAst)) {
        throw new Error(`execute_script: produced an empty or invalid toolCalls chain`);
    }

    let primaryToolName: string | null = null;
    let toolArgs: any = null;
    let callbacks: any = null;

    if (Array.isArray(toolCalls)) {
        primaryToolName = toolCalls[0]?.name ?? null;
        toolArgs = toolCalls[0]?.args ?? null;
        callbacks = toolCalls[0]?.callbacks ?? null;
    } else if (isAst) {
        const firstStep = (toolCalls as any).steps?.[0];
        if (firstStep && firstStep.type === 'ToolTask') {
            primaryToolName = firstStep.tool;
            toolArgs = firstStep.args;
        } else {
            primaryToolName = 'AST_Sequence';
        }
    }

    // 3. Spawn the child Request
    const childRequest = await prisma.request.create({
        data: {
            status: 'NEW',
            toolName: primaryToolName,
            ast: isAst ? (toolCalls as any) : compileToAST(toolCalls as any[]),
            scriptId: resolvedScriptId,
            userId,
            conversationId: request.conversationId,
            parentId: request.id,
            // Inherit parent resources so {{resource.*}} templates resolve in the chain
            ...(request.resources?.length
                ? { resources: { connect: request.resources.map((r: any) => ({ id: r.id })) } }
                : {}),
        },
    });

    console.log(`[Tools] execute_script: spawned child Request ${childRequest.id} from "${nameForLogging}" with ${toolCalls.length} tool call(s)`);

    return {
        data: {
            scriptName: nameForLogging,
            childRequestId: childRequest.id,
            toolCallCount: toolCalls.length,
            isStored: !!resolvedScriptId
        },
        createdItem: childRequest,
    };
}
