import type { PrismaClient } from '@prisma/client';
export interface SemanticPropertyShape {
    path: string;
    name?: string;
    description?: string;
    datatype?: string;
    class?: string | string[];
    minCount?: number;
    maxCount?: number;
    in?: any[];
    pattern?: string;
    inverse?: boolean;
}
export interface SemanticNodeShape {
    uri: string;
    targetClass: string;
    name?: string;
    description?: string;
    properties: Record<string, SemanticPropertyShape>;
}
export declare class SemanticSchemaEngine {
    private prisma;
    private shapes;
    private datatypeCache;
    constructor(prisma: PrismaClient);
    /**
     * Register a DSL shape with the engine.
     */
    registerShape(shape: SemanticNodeShape): void;
    /**
     * Bulk register shapes from the central CuratorEngine plugin registry.
     */
    loadRegisteredShapes(engine: any): void;
    /**
     * Create a new entity conforming to a registered DSL shape.
     */
    createEntity(shapeUri: string, subjectUri: string, data: Record<string, any>, userId: number, projectId: number): Promise<string>;
    private _createEntityInternal;
    /**
     * Read an entity mapping back to the shape properties.
     */
    readEntity(shapeUri: string, subjectUri: string, projectIds: number[]): Promise<Record<string, any> | null>;
    /**
     * Updates an entity by fully replacing properties defined in the shape (Diff approach).
     */
    updateEntity(shapeUri: string, subjectUri: string, data: Record<string, any>, userId: number, projectId: number): Promise<string>;
    /**
     * Delete an entity (soft-delete resource and relations).
     */
    deleteEntity(subjectUri: string, projectId: number): Promise<boolean>;
    private ensureResource;
    private ensureDatatype;
}
//# sourceMappingURL=SemanticSchemaEngine.d.ts.map