import { PrismaClient } from '@prisma/client';
import type { ToolResult, Fannable } from './types.js';

export interface ExtractUdcInput {
    uri: string;
}

/**
 * Utility tool to calculate UDC hierarchy from a URI.
 * logic: 338 -> 33 -> 3 -> top
 */
export async function extractUdcHierarchy(
    args: ExtractUdcInput,
    _prisma: PrismaClient,
): Promise<ToolResult & Fannable> {
    const { uri } = args;
    
    const match = uri.match(/id=([0-9.]+)/);
    if (!match) return { success: false, data: null, items: [] };

    const notation = match[1]!;

    if (notation.length <= 1) {
        return { success: true, data: { isTopLevel: true }, items: [] };
    }

    // Calculate Parent Notation
    let parentNotation = notation.endsWith('.') 
        ? notation.slice(0, -2) 
        : notation.slice(0, -1);
        
    if (parentNotation.endsWith('.')) parentNotation = parentNotation.slice(0, -1);
    
    if (!parentNotation) {
        return { success: true, data: { isTopLevel: true }, items: [] };
    }

    const parentUri = `https://udcsummary.info/items/?id=${parentNotation}`;

    const data = {
        childNotation: notation,
        parentNotation,
        parentUri,
        childUri: uri
    };

    return {
        success: true,
        data,
        items: [data] // Fan out to continue the chain
    };
}
