import { PrismaClient } from '@prisma/client';
import type { ToolResult } from './types.js';

export interface SetContextInput {
    key: string;
    value: any;
}

export interface GetContextInput {
    key: string;
}

/**
 * Saves a value to the persistent conversation metadata.
 */
export async function setContext(
    args: SetContextInput,
    prisma: PrismaClient,
    _userId: string,
    _responseId?: number,
    request?: any
): Promise<ToolResult> {
    const { key, value } = args;
    const conversationId = request?.conversationId;

    if (!conversationId) {
        throw new Error("Cannot set context: No active conversation found in request.");
    }

    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
    });

    const currentMetadata = (conversation?.metadata as Record<string, any>) || {};
    const newMetadata = { ...currentMetadata, [key]: value };

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { metadata: newMetadata }
    });

    console.log(`[Tools] set_context: "${key}" = ${JSON.stringify(value)}`);

    return {
        success: true,
        data: { key, value, updated: true }
    };
}

/**
 * Retrieves a value from the persistent conversation metadata.
 */
export async function getContext(
    args: GetContextInput,
    prisma: PrismaClient,
    _userId: string,
    _responseId?: number,
    request?: any
): Promise<ToolResult> {
    const { key } = args;
    const conversationId = request?.conversationId;

    if (!conversationId) {
        throw new Error("Cannot get context: No active conversation found in request.");
    }

    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
    });

    const metadata = (conversation?.metadata as Record<string, any>) || {};
    const value = metadata[key];

    return {
        success: true,
        data: { key, value }
    };
}
