import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'node:crypto';

export interface SemanticPropertyShape {
    path: string;            // The predicate URI (e.g. 'schema:name')
    name?: string;           // Human-readable label
    description?: string;    // Ontological description
    datatype?: string;       // e.g. 'xsd:string', 'xsd:integer', 'xsd:boolean', 'xsd:dateTime', 'xsd:float'
    class?: string | string[]; // Target class URI(s) if it's a relation to another entity
    minCount?: number;
    maxCount?: number;
    in?: any[];              // Enum values
    pattern?: string;        // Regex validation string
    inverse?: boolean;       // If true, lookup where this node is the object, not subject
}

export interface SemanticNodeShape {
    uri: string;             // Shape URI
    targetClass: string;     // e.g. 'schema:Person'
    name?: string;           // Human-readable class name
    description?: string;    // Ontological description
    properties: Record<string, SemanticPropertyShape>; // maps logical field name to its property shape
}

export class SemanticSchemaEngine {
    private prisma: PrismaClient;
    private shapes: Record<string, SemanticNodeShape> = {};
    private datatypeCache: Record<string, number> = {};

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    /**
     * Register a DSL shape with the engine.
     */
    public registerShape(shape: SemanticNodeShape) {
        this.shapes[shape.uri] = shape;
    }

    /**
     * Bulk register shapes from the central CuratorEngine plugin registry.
     */
    public loadRegisteredShapes(engine: any) {
        for (const [uri, shape] of engine.models.entries()) {
            this.registerShape(shape);
        }
    }

    /**
     * Create a new entity conforming to a registered DSL shape.
     */
    public async createEntity(
        shapeUri: string,
        subjectUri: string,
        data: Record<string, any>,
        userId: number,
        projectId: number
    ): Promise<string> {
        await this.prisma.$transaction(async (tx) => {
            await this._createEntityInternal(tx, shapeUri, subjectUri, data, userId, projectId);
        });
        return subjectUri;
    }

    private async _createEntityInternal(
        tx: Prisma.TransactionClient,
        shapeUri: string,
        subjectUri: string,
        data: Record<string, any>,
        userId: number,
        projectId: number
    ): Promise<string> {
        const shape = this.shapes[shapeUri];
        if (!shape) throw new Error(`Semantic shape ${shapeUri} not found.`);

        // 1. Create/Upsert the Subject Resource
        const subject = await tx.resource.upsert({
            where: { uri: subjectUri },
            update: { deletedAt: null, existent: true },
            create: { uri: subjectUri, title: data.title || subjectUri, userId, projectId }
        });

        // 2. Add rdf:type relation
        const rdfType = await this.ensureResource(tx, 'rdf:type', 'type', userId, 1);
        const classResource = await this.ensureResource(tx, shape.targetClass, shape.name || shape.targetClass, userId, 1, shape.description);
            
            await tx.relation.upsert({
                where: {
                    subjectId_predicateId_objectId: {
                        subjectId: subject.id,
                        predicateId: rdfType.id,
                        objectId: classResource.id
                    }
                },
                update: { existent: true },
                create: {
                    subjectId: subject.id,
                    predicateId: rdfType.id,
                    objectId: classResource.id,
                    projectId
                }
            });

            // 3. Process properties based on DSL
            for (const [fieldName, propShape] of Object.entries(shape.properties)) {
                let value = data[fieldName];
                
                // Validate constraints
                if (propShape.minCount && propShape.minCount > 0 && (value === undefined || value === null)) {
                    throw new Error(`Property ${fieldName} (minCount: ${propShape.minCount}) is missing.`);
                }

                if (value === undefined || value === null) continue;

                const values = Array.isArray(value) ? value : [value];

                if (propShape.maxCount && values.length > propShape.maxCount) {
                    throw new Error(`Property ${fieldName} exceeds maxCount of ${propShape.maxCount}.`);
                }

                if (propShape.in) {
                    for (const v of values) {
                        if (!propShape.in.includes(v)) {
                            throw new Error(`Value '${v}' is not in allowed enum options for ${fieldName}.`);
                        }
                    }
                }

                if (propShape.pattern) {
                    const regex = new RegExp(propShape.pattern);
                    for (const v of values) {
                        if (typeof v === 'string' && !regex.test(v)) {
                            throw new Error(`Value '${v}' does not match required pattern ${propShape.pattern} for ${fieldName}.`);
                        }
                    }
                }

                const predicate = await this.ensureResource(tx, propShape.path, propShape.name || fieldName, userId, 1, propShape.description);

                for (const v of values) {
                    if (propShape.class) {
                        // Object Relation
                        let objectUri: string;
                        
                        if (typeof v === 'object' && v !== null) {
                            const targetClass = Array.isArray(propShape.class) ? (v['@type'] || propShape.class[0]) : propShape.class;
                            const className = targetClass.split(':')[1] || 'object';
                            objectUri = `${className.toLowerCase()}:${crypto.randomUUID()}`;
                            await this._createEntityInternal(tx, targetClass + 'Shape', objectUri, v, userId, projectId);
                        } else {
                            objectUri = String(v);
                        }

                        const objectResource = await this.ensureResource(tx, objectUri, objectUri, userId, projectId);
                        
                        await tx.relation.upsert({
                            where: {
                                subjectId_predicateId_objectId: {
                                    subjectId: subject.id,
                                    predicateId: predicate.id,
                                    objectId: objectResource.id
                                }
                            },
                            update: { existent: true },
                            create: {
                                subjectId: subject.id,
                                predicateId: predicate.id,
                                objectId: objectResource.id,
                                projectId
                            }
                        });
                    } else if (propShape.datatype === 'curator:textBlob') {
                        // Large Text Blob
                        const blobUri = `blob:${crypto.randomUUID()}`;
                        const blobResource = await tx.resource.create({
                            data: {
                                uri: blobUri,
                                title: blobUri,
                                content: String(v),
                                userId,
                                projectId
                            }
                        });

                        await tx.relation.upsert({
                            where: {
                                subjectId_predicateId_objectId: {
                                    subjectId: subject.id,
                                    predicateId: predicate.id,
                                    objectId: blobResource.id
                                }
                            },
                            update: { existent: true },
                            create: {
                                subjectId: subject.id,
                                predicateId: predicate.id,
                                objectId: blobResource.id,
                                projectId
                            }
                        });
                    } else if (propShape.datatype) {
                        const datatypeId = await this.ensureDatatype(tx, propShape.datatype);
                        const literalData: any = { literalDatatypeId: datatypeId };
                        let targetObjectId: number;

                        if (propShape.datatype === 'xsd:string') {
                            const stringVal = String(v);
                            const hash = crypto.createHash('sha256').update(stringVal).digest('hex');
                            const literalUri = `literal:${propShape.datatype}:${hash}`;
                            
                            const literalResource = await tx.resource.upsert({
                                where: { uri: literalUri },
                                update: { existent: true },
                                create: { 
                                    uri: literalUri, 
                                    title: stringVal.substring(0, 255),
                                    content: stringVal,
                                    userId, 
                                    projectId 
                                }
                            });
                            targetObjectId = literalResource.id;
                        } else {
                            switch (propShape.datatype) {
                                case 'xsd:integer':
                                case 'xsd:float':
                                case 'xsd:double': literalData.literalValue = Number(v); break;
                                case 'xsd:boolean': literalData.literalBoolean = Boolean(v); break;
                                case 'xsd:dateTime': literalData.literalDate = new Date(v); break;
                            }
                            targetObjectId = predicate.id;
                        }

                        await tx.relation.upsert({
                            where: {
                                subjectId_predicateId_objectId: {
                                    subjectId: subject.id,
                                    predicateId: predicate.id,
                                    objectId: targetObjectId
                                }
                            },
                            update: { existent: true, ...literalData },
                            create: {
                                subjectId: subject.id,
                                predicateId: predicate.id,
                                objectId: targetObjectId,
                                projectId,
                                ...literalData
                            }
                        });
                    }
                }
            }
        return subjectUri;
    }

    /**
     * Read an entity mapping back to the shape properties.
     */
    public async readEntity(
        shapeUri: string,
        subjectUri: string,
        projectIds: number[]
    ): Promise<Record<string, any> | null> {
        const shape = this.shapes[shapeUri];
        if (!shape) throw new Error(`DSL shape ${shapeUri} not found.`);

        const scopes = [...new Set([...projectIds, 1])];

        const resource = await this.prisma.resource.findUnique({
            where: { uri: subjectUri },
            include: {
                subjectRelations: {
                    where: { projectId: { in: scopes }, existent: true },
                    include: { predicate: true, object: true }
                },
                objectRelations: {
                    where: { projectId: { in: scopes }, existent: true },
                    include: { predicate: true, subject: true }
                }
            }
        });

        if (!resource || !resource.existent) return null;

        const result: Record<string, any> = { uri: subjectUri };

        for (const [fieldName, propShape] of Object.entries(shape.properties)) {
            const matches = propShape.inverse
                ? resource.objectRelations.filter(rel => rel.predicate.uri === propShape.path)
                : resource.subjectRelations.filter(rel => rel.predicate.uri === propShape.path);
            
            if (matches.length === 0) continue;

            const extract = (rel: any) => {
                if (propShape.inverse) return rel.subject.uri;
                if (propShape.class) return rel.object.uri;
                if (propShape.datatype === 'curator:textBlob') return rel.object.content;
                if (propShape.datatype) {
                    switch (propShape.datatype) {
                        case 'xsd:string': return rel.object?.content;
                        case 'xsd:integer':
                        case 'xsd:float':
                        case 'xsd:double': return rel.literalValue;
                        case 'xsd:boolean': return rel.literalBoolean;
                        case 'xsd:dateTime': return rel.literalDate;
                        default: return rel.object?.content;
                    }
                }
                return null;
            };

            const isArray = propShape.maxCount === undefined || propShape.maxCount > 1;
            
            if (isArray) {
                result[fieldName] = matches.map(extract).filter(v => v !== null);
            } else {
                result[fieldName] = extract(matches[0]);
            }
        }

        return result;
    }

    /**
     * Updates an entity by fully replacing properties defined in the shape (Diff approach).
     */
    public async updateEntity(
        shapeUri: string,
        subjectUri: string,
        data: Record<string, any>,
        userId: number,
        projectId: number
    ): Promise<string> {
        const shape = this.shapes[shapeUri];
        if (!shape) throw new Error(`DSL shape ${shapeUri} not found.`);

        await this.prisma.$transaction(async (tx) => {
            const subject = await tx.resource.findUnique({ where: { uri: subjectUri } });
            if (!subject) throw new Error(`Resource ${subjectUri} not found.`);

            for (const [fieldName, propShape] of Object.entries(shape.properties)) {
                if (!(fieldName in data)) continue; // Only update provided fields

                const value = data[fieldName];
                
                // 1. Delete existing relations for this property path
                const predicate = await tx.resource.findUnique({ where: { uri: propShape.path } });
                if (predicate) {
                    await tx.relation.deleteMany({
                        where: {
                            subjectId: subject.id,
                            predicateId: predicate.id,
                            projectId
                        }
                    });
                }

                // 2. Re-insert new values
                if (value === undefined || value === null) continue;
                
                const values = Array.isArray(value) ? value : [value];

                if (propShape.in) {
                    for (const v of values) {
                        if (!propShape.in.includes(v)) {
                            throw new Error(`Value '${v}' is not in allowed enum options for ${fieldName}.`);
                        }
                    }
                }

                if (propShape.pattern) {
                    const regex = new RegExp(propShape.pattern);
                    for (const v of values) {
                        if (typeof v === 'string' && !regex.test(v)) {
                            throw new Error(`Value '${v}' does not match required pattern ${propShape.pattern} for ${fieldName}.`);
                        }
                    }
                }

                const predicateResource = await this.ensureResource(tx, propShape.path, propShape.name || fieldName, userId, 1, propShape.description);

                for (const v of values) {
                    if (propShape.class) {
                        let objectUri: string;
                        
                        if (typeof v === 'object' && v !== null) {
                            const targetClass = Array.isArray(propShape.class) ? (v['@type'] || propShape.class[0]) : propShape.class;
                            const className = targetClass.split(':')[1] || 'object';
                            objectUri = `${className.toLowerCase()}:${crypto.randomUUID()}`;
                            await this._createEntityInternal(tx, targetClass + 'Shape', objectUri, v, userId, projectId);
                        } else {
                            objectUri = String(v);
                        }

                        const objectResource = await this.ensureResource(tx, objectUri, objectUri, userId, projectId);
                        
                        await tx.relation.create({
                            data: {
                                subjectId: subject.id,
                                predicateId: predicateResource.id,
                                objectId: objectResource.id,
                                projectId
                            }
                        });
                    } else if (propShape.datatype === 'curator:textBlob') {
                        const blobUri = `blob:${crypto.randomUUID()}`;
                        const blobResource = await tx.resource.create({
                            data: {
                                uri: blobUri,
                                title: blobUri,
                                content: String(v),
                                userId,
                                projectId
                            }
                        });

                        await tx.relation.create({
                            data: {
                                subjectId: subject.id,
                                predicateId: predicateResource.id,
                                objectId: blobResource.id,
                                projectId
                            }
                        });
                    } else if (propShape.datatype) {
                        const datatypeId = await this.ensureDatatype(tx, propShape.datatype);
                        const literalData: any = { literalDatatypeId: datatypeId };
                        let targetObjectId: number;

                        if (propShape.datatype === 'xsd:string') {
                            const stringVal = String(v);
                            const hash = crypto.createHash('sha256').update(stringVal).digest('hex');
                            const literalUri = `literal:${propShape.datatype}:${hash}`;
                            
                            const literalResource = await tx.resource.upsert({
                                where: { uri: literalUri },
                                update: { existent: true },
                                create: { 
                                    uri: literalUri, 
                                    title: stringVal.substring(0, 255),
                                    content: stringVal,
                                    userId, 
                                    projectId 
                                }
                            });
                            targetObjectId = literalResource.id;
                        } else {
                            switch (propShape.datatype) {
                                case 'xsd:integer':
                                case 'xsd:float':
                                case 'xsd:double': literalData.literalValue = Number(v); break;
                                case 'xsd:boolean': literalData.literalBoolean = Boolean(v); break;
                                case 'xsd:dateTime': literalData.literalDate = new Date(v); break;
                            }
                            targetObjectId = predicateResource.id;
                        }

                        await tx.relation.create({
                            data: {
                                subjectId: subject.id,
                                predicateId: predicateResource.id,
                                objectId: targetObjectId,
                                projectId,
                                ...literalData
                            }
                        });
                    }
                }
            }
        });

        return subjectUri;
    }

    /**
     * Delete an entity (soft-delete resource and relations).
     */
    public async deleteEntity(subjectUri: string, projectId: number): Promise<boolean> {
        const resource = await this.prisma.resource.findUnique({ where: { uri: subjectUri } });
        if (!resource) return false;

        await this.prisma.$transaction(async (tx) => {
            await tx.resource.update({
                where: { id: resource.id },
                data: { existent: false, deletedAt: new Date() }
            });

            await tx.relation.updateMany({
                where: { subjectId: resource.id, projectId },
                data: { existent: false }
            });
        });

        return true;
    }

    // Helper to lazily ensure a resource exists
    private async ensureResource(
        tx: Prisma.TransactionClient,
        uri: string,
        title: string,
        userId: number,
        projectId: number,
        description?: string
    ) {
        return tx.resource.upsert({
            where: { uri },
            update: { existent: true, deletedAt: null, title, description: description || undefined },
            create: { uri, title, userId, projectId, description }
        });
    }

    private async ensureDatatype(tx: Prisma.TransactionClient, name: string): Promise<number> {
        if (this.datatypeCache[name]) return this.datatypeCache[name];
        const datatype = await tx.datatype.upsert({
            where: { name },
            update: {},
            create: { name }
        });
        this.datatypeCache[name] = datatype.id;
        return datatype.id;
    }
}
