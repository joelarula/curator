import { PrismaClient } from '@prisma/client';
import { persistAddress } from './tools/persistAddress.js';
import { processFeed } from './tools/processFeed.js';

/**
 * Registry of tool implementations
 */
export async function executeTool(
    toolName: string, 
    args: any, 
    prisma: PrismaClient, 
    userId: string,
    responseId: string,
    request: any
) {
    if (toolName === 'persist_address') {
        await persistAddress(args, prisma, userId, responseId);
    } else if (toolName === 'process_feed') {
        await processFeed(args, prisma, userId, responseId, request);
    } else {
        throw new Error(`Unknown tool: ${toolName}`);
    }
}
