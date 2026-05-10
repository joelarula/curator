import { PrismaClient } from '@prisma/client';
import type { ToolResult } from './types.js';

export interface DebugInput {
    message?: string;
    data?: any;
}

/**
 * Debug tool — simply logs a message or data to the server console.
 * Useful for inspecting template resolution results during execution.
 */
export async function debug(
    args: DebugInput,
    _prisma: PrismaClient,
    _userId: string
): Promise<ToolResult> {
    const { message, data } = args;

    if (message) {
        console.log(`[DEBUG TOOL] 📝 ${message}`);
    }
    
    if (data !== undefined) {
        console.log(`[DEBUG TOOL] 📦 Data:`, JSON.stringify(data, null, 2));
    }

    return {
        success: true,
        data: { logged: true }
    };
}
