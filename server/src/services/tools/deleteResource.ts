import { PrismaClient } from '@prisma/client';
import type { ToolResult } from './types.js';

export interface DeleteResourceInput {
    uri?: string;
    id?: number;
    hardDelete?: boolean;
}

export async function deleteResource(
    args: DeleteResourceInput,
    prisma: PrismaClient,
    _userId: string
): Promise<ToolResult> {
    const { uri, id, hardDelete = true } = args;

    if (!uri && !id) {
        throw new Error('delete_resource requires either uri or id.');
    }

    // Find the resource
    const resource = await prisma.resource.findFirst({
        where: id ? { id } : { uri: uri! }
    });

    if (!resource) {
        return {
            success: true,
            data: { message: `Resource not found, nothing to delete.` }
        };
    }

    if (hardDelete) {
        // Hard delete: cascade handles relations and texts
        await prisma.resource.delete({
            where: { id: resource.id }
        });
        console.log(`[Tools] delete_resource: Hard deleted resource ${resource.uri}`);
        return {
            success: true,
            data: { action: 'hard_deleted', id: resource.id, uri: resource.uri }
        };
    } else {
        // Soft delete: set existent = null and deletedAt = now
        await prisma.resource.update({
            where: { id: resource.id },
            data: { existent: null, deletedAt: new Date() }
        });
        
        // Also soft delete relations where it is subject or object
        await prisma.relation.updateMany({
            where: {
                OR: [
                    { subjectId: resource.id },
                    { objectId: resource.id }
                ]
            },
            data: { existent: null }
        });

        console.log(`[Tools] delete_resource: Soft deleted resource ${resource.uri}`);
        return {
            success: true,
            data: { action: 'soft_deleted', id: resource.id, uri: resource.uri }
        };
    }
}
