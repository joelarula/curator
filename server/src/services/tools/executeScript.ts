import { PrismaClient } from '@prisma/client';
import { ScriptRunner } from '../ScriptRunner.js';

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
    responseId: number,
    request: any
) {
    const { scriptName, scriptId, body: inlineBody, args: scriptArgs = {} } = args;

    let toolCalls: any[] = [];
    let resolvedScriptId: number | null = null;
    let nameForLogging = 'inline';

    if (inlineBody) {
        // 1. DYNAMIC INLINE
        console.log(`[Tools] execute_script: running inline script (${inlineBody.length} chars)`);
        toolCalls = await ScriptRunner.evaluate(inlineBody, scriptArgs, prisma, userId);
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

    if (!toolCalls || !toolCalls.length) {
        throw new Error(`execute_script: produced an empty toolCalls chain`);
    }

    const primaryToolName = toolCalls[0]?.name ?? null;

    // 3. Spawn the child Request
    const childRequest = await prisma.request.create({
        data: {
            status: 'NEW',
            toolName: primaryToolName,
            toolArgs: toolCalls[0]?.args ?? null,
            callbacks: toolCalls[0]?.callbacks ?? null,
            toolCalls: toolCalls as any,
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
