import type { PrismaClient } from '@prisma/client';
import type { ToolResult, Fannable } from './types.js';

/**
 * Generic tool to extract object resources from a list of relations based on predicate URI.
 */
export async function selectObjects(
    args: { items: any[], predicateUri: string },
    _prisma: PrismaClient,
    _userId: string
): Promise<ToolResult & Fannable> {
    const { items, predicateUri } = args;

    if (!Array.isArray(items)) {
        return { success: false, error: 'items must be an array', data: [], items: [] };
    }

    console.log(`[Tools] select_objects: Filtering ${items.length} items for predicate ${predicateUri}`);

    const filtered = items
        .filter(r => r.predicateUri === predicateUri)
        .map(r => r.object)
        .filter(Boolean);

    return {
        success: true,
        data: filtered,
        items: filtered
    };
}
