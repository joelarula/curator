import { PrismaClient } from '@prisma/client';
import type { ToolResult, Fannable } from './types.js';

export interface GetResourceInput {
    id?: number;
    uri?: string;
}

/**
 * Fetches a single resource with all its relations and texts.
 * Uses the Fannable pattern ([resource] or []) to handle optionality in chains.
 */
export async function getResource(
    args: GetResourceInput,
    prisma: PrismaClient,
    _userId: string,
): Promise<ToolResult & Fannable> {
    const { id, uri } = args;

    if (!id && !uri) {
        throw new Error("Missing required argument: either 'id' or 'uri' must be provided.");
    }

    console.log(`[Tools] get_resource: Fetching resource by ${id ? `ID ${id}` : `URI ${uri}`}`);

    const where: any = id 
        ? { id, userId: _userId, existent: true } 
        : { userId_uri: { userId: _userId, uri: uri! }, existent: true };


    const resource = await prisma.resource.findFirst({
        where,
        include: {
            texts: true,
            subjectRelations: {
                include: { predicate: true, object: true }
            },
            objectRelations: {
                include: { subject: true, predicate: true }
            },
            predicateRelations: {
                include: { subject: true, object: true }
            }
        }
    });


    if (!resource) {
        console.log(`[Tools] get_resource: Resource not found.`);
        return {
            success: true, // Tool executed successfully, even if result is empty
            data: null,
            items: [] // Empty list means downstream .onItem() will not fire
        };
    }

    return {
        success: true,
        data: resource,
        items: [resource] // One item means downstream .onItem() will fire once
    };
}
